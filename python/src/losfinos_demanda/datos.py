"""Carga, validación y separación temporal del dataset histórico de demanda.

Fuente única: vista dbo.LFSim_DemandaDiaria (lote sintético LF-DEMANDA-V1).
Todo es de solo lectura; ninguna función modifica datos ni elimina filas.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine

LOTE_POR_DEFECTO = "LF-DEMANDA-V1"
VISTA = "dbo.LFSim_DemandaDiaria"

COLUMNAS = [
    "LoteID", "Lote", "Fecha", "ProductoID", "NombreProducto", "CategoriaID",
    "DiaSemana", "Mes", "Disponible", "PrecioSimulado", "UnidadesVendidas",
    "UnidadesAnuladas", "ImporteVendido", "EsSintetico",
]
COLUMNAS_ESENCIALES = [
    "Lote", "Fecha", "ProductoID", "NombreProducto", "DiaSemana", "Mes",
    "Disponible", "PrecioSimulado", "UnidadesVendidas", "UnidadesAnuladas", "ImporteVendido",
]
PRODUCTOS_PLATO = list(range(1, 8))  # ProductoID 1-7 son platos; el resto, bebidas y extras
MENUS_ALTERNANTES = [6, 7]

# Controles esperados del lote cargado (referencia, no se fabrican datos).
CONTROLES_LOTE = {
    "dias": 183,
    "productos": 10,
    "filas": 1830,
    "platos_vendidos": 9282,
    "fecha_inicio": "2026-04-29",
    "fecha_fin": "2026-10-28",
}
CORTE_DESARROLLO = pd.Timestamp("2026-09-30")
INICIO_PRUEBA = pd.Timestamp("2026-10-01")
TOLERANCIA_MONETARIA = 0.011

_CONSULTA = text(
    f"SELECT {', '.join(COLUMNAS)} FROM {VISTA} "
    "WHERE Lote = :lote ORDER BY Fecha, ProductoID"
)


def cargar_demanda_diaria(engine: Engine, lote: str = LOTE_POR_DEFECTO) -> pd.DataFrame:
    """Lee el lote indicado (consulta parametrizada) y tipifica las columnas."""
    with engine.connect() as conn:
        df = pd.read_sql(_CONSULTA, conn, params={"lote": lote})
    return tipificar(df)


def tipificar(df: pd.DataFrame) -> pd.DataFrame:
    """Convierte tipos sin descartar ni corregir valores."""
    df = df.copy()
    if "Fecha" in df:
        df["Fecha"] = pd.to_datetime(df["Fecha"])
    for col in ("PrecioSimulado", "ImporteVendido"):
        if col in df:
            df[col] = pd.to_numeric(df[col])
    for col in ("UnidadesVendidas", "UnidadesAnuladas", "Disponible", "DiaSemana", "Mes"):
        if col in df:
            df[col] = pd.to_numeric(df[col])
    return df


@dataclass(frozen=True)
class Resultado:
    """nivel: ok | info | revisar | error (error impide continuar)."""

    control: str
    nivel: str
    detalle: str


def _res(control: str, ok: bool, detalle_ok: str, detalle_mal: str, nivel_mal: str = "error") -> Resultado:
    return Resultado(control, "ok" if ok else nivel_mal, detalle_ok if ok else detalle_mal)


def validar_demanda(df: pd.DataFrame) -> pd.DataFrame:
    """Ejecuta los controles de calidad y devuelve una tabla de resultados."""
    r: list[Resultado] = []

    faltantes = [c for c in COLUMNAS if c not in df.columns]
    r.append(_res("Columnas obligatorias", not faltantes, "Presentes las 14 columnas.", f"Faltan: {faltantes}"))
    if faltantes or df.empty:
        if df.empty:
            r.append(Resultado("Datos", "error", "La consulta no devolvió filas."))
        return pd.DataFrame(r)

    lotes = df["Lote"].unique().tolist()
    r.append(_res("Lote único", len(lotes) == 1, f"Un solo lote: {lotes[0]}.", f"Lotes encontrados: {lotes}"))

    dup = df.duplicated(["Lote", "Fecha", "ProductoID"]).sum()
    r.append(_res("Sin duplicados Fecha+Producto", dup == 0, "0 duplicados.", f"{dup} filas duplicadas."))

    nulos = df[COLUMNAS_ESENCIALES].isna().sum()
    nulos = nulos[nulos > 0]
    r.append(_res("Sin nulos en campos esenciales", nulos.empty, "0 nulos.", f"Nulos por columna: {nulos.to_dict()}"))

    n_dias, n_prod = df["Fecha"].nunique(), df["ProductoID"].nunique()
    rango = pd.date_range(df["Fecha"].min(), df["Fecha"].max(), freq="D")
    dias_faltantes = rango.difference(pd.DatetimeIndex(df["Fecha"].unique()))
    por_dia = df.groupby("Fecha")["ProductoID"].nunique()
    por_prod = df.groupby("ProductoID")["Fecha"].nunique()
    cobertura_ok = dias_faltantes.empty and (por_dia == n_prod).all() and (por_prod == n_dias).all()
    r.append(_res(
        "Cobertura diaria y por producto", cobertura_ok,
        f"{n_dias} días × {n_prod} productos = {n_dias * n_prod} filas, sin huecos.",
        f"Días faltantes: {len(dias_faltantes)}; días incompletos: {(por_dia != n_prod).sum()}; "
        f"productos incompletos: {(por_prod != n_dias).sum()}.",
    ))

    for col in ("UnidadesVendidas", "UnidadesAnuladas"):
        serie = df[col].dropna()
        valido = bool(((serie >= 0) & (serie == serie.round())).all())
        r.append(_res(f"{col}: enteros no negativos", valido, "Valores válidos.", "Hay valores negativos o no enteros."))

    r.append(_res("Disponible solo 0/1", df["Disponible"].isin([0, 1]).all(), "Valores 0/1.",
                  f"Valores: {sorted(df['Disponible'].dropna().unique().tolist())}"))

    ventas_sin_disp = ((df["Disponible"] == 0) & (df["UnidadesVendidas"] > 0)).sum()
    r.append(_res("Sin ventas con Disponible=0", ventas_sin_disp == 0, "Coherente.", f"{ventas_sin_disp} filas con ventas y Disponible=0."))

    dif = (df["ImporteVendido"] - df["UnidadesVendidas"] * df["PrecioSimulado"]).abs()
    r.append(_res(
        "ImporteVendido = Unidades × Precio", (dif <= TOLERANCIA_MONETARIA).all(),
        f"Coherente (tolerancia {TOLERANCIA_MONETARIA}).",
        f"{(dif > TOLERANCIA_MONETARIA).sum()} filas fuera de tolerancia; diferencia máxima {dif.max():.2f}.",
    ))

    dia_ok = (df["DiaSemana"] == df["Fecha"].dt.dayofweek + 1).all()
    r.append(_res("DiaSemana coherente (lunes=1)", dia_ok, "Coherente.",
                  f"{(df['DiaSemana'] != df['Fecha'].dt.dayofweek + 1).sum()} filas incoherentes."))
    r.append(_res("Mes coherente con Fecha", (df["Mes"] == df["Fecha"].dt.month).all(), "Coherente.",
                  f"{(df['Mes'] != df['Fecha'].dt.month).sum()} filas incoherentes."))

    # Controles informativos del lote: las diferencias se muestran para revisión.
    esperado = CONTROLES_LOTE
    real = {
        "dias": n_dias, "productos": n_prod, "filas": len(df),
        "platos_vendidos": int(df.loc[df["ProductoID"].isin(PRODUCTOS_PLATO), "UnidadesVendidas"].sum()),
        "fecha_inicio": df["Fecha"].min().strftime("%Y-%m-%d"), "fecha_fin": df["Fecha"].max().strftime("%Y-%m-%d"),
    }
    for clave, valor in esperado.items():
        coincide = real[clave] == valor
        r.append(Resultado(
            f"Control del lote: {clave}", "ok" if coincide else "revisar",
            f"{real[clave]} (esperado {valor})." if coincide else f"Obtenido {real[clave]}; esperado {valor}. Revisar.",
        ))

    anuladas = int(df["UnidadesAnuladas"].sum())
    r.append(Resultado("Unidades anuladas", "info", f"{anuladas} unidades anuladas en total (no se restan de UnidadesVendidas)."))
    sinteticos = df["EsSintetico"].astype(bool)
    r.append(_res("EsSintetico", sinteticos.all(), "Todas las filas son sintéticas.", f"{(~sinteticos).sum()} filas no sintéticas.", "revisar"))
    return pd.DataFrame(r).rename(columns={"control": "Control", "nivel": "Nivel", "detalle": "Detalle"})


def hay_errores(validacion: pd.DataFrame) -> bool:
    return bool((validacion["Nivel"] == "error").any())


def exigir_sin_errores(validacion: pd.DataFrame) -> None:
    if hay_errores(validacion):
        errores = validacion.loc[validacion["Nivel"] == "error", "Control"].tolist()
        raise ValueError(f"La validación encontró errores que impiden continuar: {errores}")


def es_plato(df: pd.DataFrame) -> pd.Series:
    return df["ProductoID"].isin(PRODUCTOS_PLATO)


def platos_por_dia(df: pd.DataFrame) -> pd.Series:
    """Platos vendidos por día (ProductoID 1-7); conserva los días con cero ventas."""
    return df[es_plato(df)].groupby("Fecha")["UnidadesVendidas"].sum()


def resumen_mensual(df: pd.DataFrame) -> pd.DataFrame:
    """Resumen por mes; indica cuántos días cubre cada mes (abril y octubre son parciales)."""
    g = df.assign(Periodo=df["Fecha"].dt.to_period("M"), Plato=es_plato(df))
    out = g.groupby("Periodo").agg(
        Dias=("Fecha", "nunique"),
        UnidadesVendidas=("UnidadesVendidas", "sum"),
    )
    out["PlatosVendidos"] = g[g["Plato"]].groupby("Periodo")["UnidadesVendidas"].sum()
    dias_mes = out.index.map(lambda p: p.days_in_month)
    out["MesParcial"] = out["Dias"] < dias_mes
    return out


def separar_temporal(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Desarrollo: 29/04–30/09/2026. Prueba final reservada: 01/10–28/10/2026."""
    desarrollo = df[df["Fecha"] <= CORTE_DESARROLLO].copy()
    prueba = df[df["Fecha"] >= INICIO_PRUEBA].copy()
    return desarrollo, prueba


def resumen_separacion(desarrollo: pd.DataFrame, prueba: pd.DataFrame) -> pd.DataFrame:
    filas = []
    for nombre, d in (("Desarrollo", desarrollo), ("Prueba final (reservada)", prueba)):
        filas.append({
            "Conjunto": nombre, "Desde": d["Fecha"].min().date(), "Hasta": d["Fecha"].max().date(),
            "Días": d["Fecha"].nunique(), "Filas": len(d),
        })
    return pd.DataFrame(filas)
