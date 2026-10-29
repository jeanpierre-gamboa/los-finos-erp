"""Pronóstico de demanda diaria por producto: XGBoost global y referencia simple.

Los datos del lote son sintéticos: la evaluación demuestra el método bajo la
simulación y no acredita precisión sobre demanda real. No hay acceso a la BD aquí.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost
from xgboost import XGBRegressor

ORIGEN_TEMPORAL = pd.Timestamp("2026-04-29")  # ancla de la alternancia y de la posición temporal
HORIZONTE = 14
REZAGOS = (1, 7, 14, 28)
VENTANAS = (7, 14)
HISTORIA_MINIMA = max(max(REZAGOS), max(VENTANAS))
PRODUCTOS = tuple(range(1, 11))
MENUS_ALTERNANTES = (6, 7)

# "reg" a secas no es un objetivo válido en XGBoost; reg:squarederror es el regresor estándar.
PARAMETROS = dict(
    objective="reg:squarederror", n_estimators=150, max_depth=3, learning_rate=0.05,
    subsample=0.9, colsample_bytree=0.9, random_state=42, n_jobs=2,
)

# Bloques de evaluación (origen, último día pronosticado).
BLOQUES_VALIDACION = [("2026-08-19", "2026-09-02"), ("2026-09-02", "2026-09-16"), ("2026-09-16", "2026-09-30")]
BLOQUES_PRUEBA = [("2026-09-30", "2026-10-14"), ("2026-10-14", "2026-10-28")]


@dataclass(frozen=True)
class ReglaDisponibilidad:
    """Supuesto configurable de disponibilidad futura (alternancia del prototipo).

    El menú ``menu_par`` está disponible en los días cuya distancia al ancla es par;
    el otro menú alternante, en los impares. Los demás productos, siempre.
    No se deduce de las ventas futuras.
    """

    ancla: pd.Timestamp = ORIGEN_TEMPORAL
    menu_par: int = 6
    menu_impar: int = 7

    def disponible(self, fecha: pd.Timestamp, producto: int) -> int:
        if producto not in (self.menu_par, self.menu_impar):
            return 1
        par = (pd.Timestamp(fecha) - self.ancla).days % 2 == 0
        return int(par if producto == self.menu_par else not par)

    def describir(self) -> str:
        return (f"Producto {self.menu_par} disponible en días pares desde {self.ancla.date()}, "
                f"producto {self.menu_impar} en días impares; los demás, todos los días.")


REGLA = ReglaDisponibilidad()


def _preparar(df: pd.DataFrame) -> pd.DataFrame:
    out = df[["Fecha", "ProductoID", "NombreProducto", "Disponible", "UnidadesVendidas"]].copy()
    out["Fecha"] = pd.to_datetime(out["Fecha"])
    out["Disponible"] = out["Disponible"].astype(int)
    out["UnidadesVendidas"] = out["UnidadesVendidas"].astype(float)
    return out


def verificar_regla(df: pd.DataFrame, regla: ReglaDisponibilidad = REGLA) -> int:
    """Devuelve cuántas filas históricas contradicen la regla (0 = coincide)."""
    d = _preparar(df)
    esperado = [regla.disponible(f, p) for f, p in zip(d["Fecha"], d["ProductoID"])]
    return int((d["Disponible"].to_numpy() != np.array(esperado)).sum())


# ---------------------------------------------------------------- variables
def columnas_variables() -> list[str]:
    cols = [f"prod_{p}" for p in PRODUCTOS]
    cols += ["dia_semana", "posicion", "disponible"]
    cols += [f"lag_{k}" for k in REZAGOS] + [f"media_{v}" for v in VENTANAS]
    return cols


def _fila_variables(producto: int, fecha: pd.Timestamp, disponible: int, historia: np.ndarray) -> list[float]:
    """Variables de un producto/fecha; ``historia`` son las ventas conocidas ANTES de ``fecha`` (más antigua primero)."""
    fila = [1.0 if producto == p else 0.0 for p in PRODUCTOS]
    fila += [float(fecha.dayofweek + 1), float((fecha - ORIGEN_TEMPORAL).days), float(disponible)]
    fila += [historia[-k] if len(historia) >= k else np.nan for k in REZAGOS]
    fila += [historia[-v:].mean() if len(historia) >= v else np.nan for v in VENTANAS]
    return fila


def construir_entrenamiento(df: pd.DataFrame, origen) -> tuple[pd.DataFrame, pd.Series]:
    """Matriz de entrenamiento con fechas <= origen. Rezagos por producto; se conservan los ceros.

    Solo se descartan las filas iniciales sin historia suficiente (primeros 28 días).
    """
    origen = pd.Timestamp(origen)
    d = _preparar(df)
    d = d[d["Fecha"] <= origen].sort_values(["ProductoID", "Fecha"])
    filas, y, idx = [], [], []
    for producto, g in d.groupby("ProductoID"):
        ventas = g["UnidadesVendidas"].to_numpy()
        for i in range(HISTORIA_MINIMA, len(g)):
            fila = g.iloc[i]
            filas.append(_fila_variables(int(producto), fila["Fecha"], int(fila["Disponible"]), ventas[:i]))
            y.append(ventas[i])
            idx.append((fila["Fecha"], int(producto)))
    X = pd.DataFrame(filas, columns=columnas_variables(), index=pd.MultiIndex.from_tuples(idx, names=["Fecha", "ProductoID"]))
    return X, pd.Series(y, index=X.index, name="UnidadesVendidas")


def entrenar(df: pd.DataFrame, origen, parametros: dict | None = None) -> XGBRegressor:
    X, y = construir_entrenamiento(df, origen)
    modelo = XGBRegressor(**(parametros or PARAMETROS))
    modelo.fit(X[columnas_variables()], y)
    return modelo


# ---------------------------------------------------------------- pronóstico
def _historia_hasta(df: pd.DataFrame, origen: pd.Timestamp) -> pd.DataFrame:
    """Ventas conocidas hasta el origen inclusive (cualquier dato posterior se ignora)."""
    d = _preparar(df)
    d = d[d["Fecha"] <= origen]
    if d.empty or d["Fecha"].max() != origen:
        raise ValueError(f"La historia no llega al origen {origen.date()}.")
    return d


def _nombres(d: pd.DataFrame) -> dict[int, str]:
    return d.drop_duplicates("ProductoID").set_index("ProductoID")["NombreProducto"].to_dict()


def pronosticar_xgboost(modelo: XGBRegressor, df: pd.DataFrame, origen, horizonte: int = HORIZONTE,
                        regla: ReglaDisponibilidad = REGLA) -> pd.DataFrame:
    """Pronóstico recursivo: tras el primer día, los rezagos usan las predicciones previas."""
    origen = pd.Timestamp(origen)
    d = _historia_hasta(df, origen)
    nombres = _nombres(d)
    series = {int(p): g.sort_values("Fecha")["UnidadesVendidas"].tolist() for p, g in d.groupby("ProductoID")}
    filas = []
    for paso in range(1, horizonte + 1):
        fecha = origen + pd.Timedelta(days=paso)
        disp = {p: regla.disponible(fecha, p) for p in PRODUCTOS}
        X = pd.DataFrame(
            [_fila_variables(p, fecha, disp[p], np.asarray(series[p])) for p in PRODUCTOS],
            columns=columnas_variables(),
        )
        pred = np.clip(modelo.predict(X), 0.0, None)
        for p, valor in zip(PRODUCTOS, pred):
            valor = float(valor) if disp[p] else 0.0
            series[p].append(valor)
            filas.append((fecha, p, nombres[p], disp[p], valor))
    return pd.DataFrame(filas, columns=["Fecha", "ProductoID", "NombreProducto", "Disponible", "UnidadesPronosticadas"])


def pronosticar_referencia(df: pd.DataFrame, origen, horizonte: int = HORIZONTE,
                           regla: ReglaDisponibilidad = REGLA) -> pd.DataFrame:
    """Promedio de las últimas 4 observaciones disponibles del mismo día de la semana.

    Con menos de 4 usa las existentes; sin ninguna, el promedio de los días disponibles de los
    últimos 28 días conocidos. Si el producto no estará disponible, predice cero.
    """
    origen = pd.Timestamp(origen)
    d = _historia_hasta(df, origen)
    nombres = _nombres(d)
    filas = []
    for paso in range(1, horizonte + 1):
        fecha = origen + pd.Timedelta(days=paso)
        for p in PRODUCTOS:
            disp = regla.disponible(fecha, p)
            valor = 0.0
            if disp:
                g = d[(d["ProductoID"] == p) & (d["Disponible"] == 1)]
                mismo = g[g["Fecha"].dt.dayofweek == fecha.dayofweek].sort_values("Fecha").tail(4)
                if len(mismo):
                    valor = float(mismo["UnidadesVendidas"].mean())
                else:
                    ult = g[g["Fecha"] > origen - pd.Timedelta(days=28)]
                    valor = float(ult["UnidadesVendidas"].mean()) if len(ult) else 0.0
            filas.append((fecha, p, nombres[p], disp, valor))
    return pd.DataFrame(filas, columns=["Fecha", "ProductoID", "NombreProducto", "Disponible", "UnidadesPronosticadas"])


# ---------------------------------------------------------------- métricas
def _mae_wape(real: pd.Series, pred: pd.Series) -> tuple[float, float]:
    err = (real - pred).abs().sum()
    mae = float(err / len(real)) if len(real) else np.nan
    suma = float(real.sum())
    return mae, (float(err / suma) if suma > 0 else np.nan)  # NaN = no calculable (denominador cero)


def calcular_metricas(comparacion: pd.DataFrame, metodo: str) -> pd.DataFrame:
    """``comparacion``: Fecha, ProductoID, Disponible, Real, Prediccion. Devuelve global, por producto y solo disponibles."""
    filas = []
    alcances = [("Global", comparacion), ("Solo días disponibles", comparacion[comparacion["Disponible"] == 1])]
    for nombre, sub in alcances:
        mae, wape = _mae_wape(sub["Real"], sub["Prediccion"])
        filas.append((metodo, nombre, "Todos", len(sub), mae, wape))
    for alcance, base in (("Por producto", comparacion), ("Por producto (solo disponibles)", comparacion[comparacion["Disponible"] == 1])):
        for p, sub in base.groupby("ProductoID"):
            mae, wape = _mae_wape(sub["Real"], sub["Prediccion"])
            filas.append((metodo, alcance, int(p), len(sub), mae, wape))
    return pd.DataFrame(filas, columns=["Metodo", "Alcance", "ProductoID", "Filas", "MAE", "WAPE"])


def unir_real(pronostico: pd.DataFrame, df: pd.DataFrame) -> pd.DataFrame:
    real = _preparar(df)[["Fecha", "ProductoID", "UnidadesVendidas"]].rename(columns={"UnidadesVendidas": "Real"})
    out = pronostico.merge(real, on=["Fecha", "ProductoID"], how="left", validate="one_to_one")
    if out["Real"].isna().any():
        raise ValueError("Hay fechas pronosticadas sin ventas observadas para evaluar.")
    return out.rename(columns={"UnidadesPronosticadas": "Prediccion"})


@dataclass
class Evaluacion:
    metricas: pd.DataFrame
    detalle: pd.DataFrame = field(repr=False)


def evaluar_bloques(df: pd.DataFrame, bloques, etapa: str) -> Evaluacion:
    """En cada origen entrena solo con fechas <= origen; ambos métodos usan la historia hasta ese origen."""
    metricas, detalle = [], []
    for origen, fin in bloques:
        origen = pd.Timestamp(origen)
        modelo = entrenar(df, origen)
        horizonte = (pd.Timestamp(fin) - origen).days
        preds = {
            "XGBoost": pronosticar_xgboost(modelo, df, origen, horizonte),
            "Referencia": pronosticar_referencia(df, origen, horizonte),
        }
        for metodo, p in preds.items():
            comp = unir_real(p, df).assign(Metodo=metodo, Origen=origen)
            detalle.append(comp)
            m = calcular_metricas(comp, metodo)
            metricas.append(m.assign(Etapa=etapa, Bloque=f"{origen.date()} → {pd.Timestamp(fin).date()}"))
    detalle = pd.concat(detalle, ignore_index=True)
    agregadas = []
    for metodo, comp in detalle.groupby("Metodo"):
        agregadas.append(calcular_metricas(comp, metodo).assign(Etapa=etapa, Bloque="Todos los bloques"))
    todas = pd.concat(metricas + agregadas, ignore_index=True)
    cols = ["Etapa", "Bloque", "Metodo", "Alcance", "ProductoID", "Filas", "MAE", "WAPE"]
    return Evaluacion(todas[cols], detalle)


# ---------------------------------------------------------------- guardado
def versiones() -> dict:
    import platform
    return {"python": platform.python_version(), "pandas": pd.__version__, "numpy": np.__version__,
            "xgboost": xgboost.__version__, "scikit-learn": sklearn.__version__, "joblib": joblib.__version__}


def guardar_modelo(modelo: XGBRegressor, ruta: Path) -> None:
    """Guarda el modelo y la lista ordenada de variables. Para predecir también se necesita la historia
    reciente de ventas (rezagos de hasta 28 días): el archivo por sí solo no basta."""
    joblib.dump({"modelo": modelo, "columnas": columnas_variables(), "productos": list(PRODUCTOS)}, ruta)


def cargar_modelo(ruta: Path) -> dict:
    paquete = joblib.load(ruta)
    if paquete["columnas"] != columnas_variables():
        raise ValueError("Las variables del modelo guardado no coinciden con el código actual.")
    return paquete


def guardar_metadata(ruta: Path, lote: str, fecha_corte, historial: tuple, regla: ReglaDisponibilidad = REGLA) -> dict:
    meta = {
        "lote": lote,
        "fecha_corte": str(pd.Timestamp(fecha_corte).date()),
        "historial": [str(pd.Timestamp(x).date()) for x in historial],
        "horizonte_dias": HORIZONTE,
        "variables": columnas_variables(),
        "parametros": PARAMETROS,
        "regla_disponibilidad": regla.describir(),
        "versiones": versiones(),
        "notas": ["Datos sintéticos: no acredita precisión sobre demanda real.",
                  "Pronóstico de productos vendidos, no de insumos a comprar.",
                  "Predecir requiere además la historia reciente de ventas (hasta 28 días)."],
    }
    Path(ruta).write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta
