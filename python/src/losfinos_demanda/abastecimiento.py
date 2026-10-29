"""Necesidades de insumos y propuesta de abastecimiento a partir del pronóstico.

Solo lectura sobre SQL Server. Las recepciones calculadas son HIPOTÉTICAS: no cambian
existencias ni equivalen a compras aprobadas. Los datos del lote son sintéticos.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

LOTE = "LF-DEMANDA-V1"
CORTE_ESPERADO = pd.Timestamp("2026-10-28")
FILAS_ESPERADAS = 140
UMBRAL_PERECIBLE_DIAS = 2.0  # cobertura del stock objetivo a partir de la cual se advierte en perecibles
TOL = 1e-9

# Unidad -> paso de redondeo de la COMPRA (1 = entero superior; 0.001 = múltiplo superior de 0,001).
REDONDEO_UNIDAD = {
    "Unidad (Und)": 1, "Unidad": 1, "Botella / Frasco": 1, "Botella/Frasco": 1,
    "Kilogramo (Kg)": 0.001, "Kg": 0.001, "Litro (L)": 0.001, "Litro": 0.001,
}
POLITICAS = ("DIARIO", "MAR-JUE-SAB", "CADA-2-DIAS", "CADA-7-DIAS", "CADA-14-DIAS")
SUPUESTOS = [
    "Compra y recepción en la misma fecha, antes del consumo (plazo de entrega cero).",
    "Sin mínimos comerciales, capacidad de almacenamiento, vencimientos ni mermas.",
    "Órdenes pendientes NO incorporadas: todavía no están implementadas; su ausencia no verifica que no existan compromisos.",
    "Stock inicial = LFSim_Insumo.StockFinal al cierre del 28/10/2026 (no Insumo.StockActual, que pudo cambiar después). La integración operativa usará existencias vigentes.",
    "Recetas = fotografía LFSim_Receta del lote.",
    "StockMinimo (catálogo actual) es un saldo objetivo provisional de seguridad, no un valor histórico demostrado.",
    "El proveedor es la sugerencia del escenario simulado, no una selección aprobada ni una comparación de cotizaciones.",
    "Los importes usan el costo referencial del lote; no son cotizaciones ni incluyen condiciones del proveedor.",
    "Reposición extraordinaria ('Urgente propuesta'): cubre solo el consumo hasta la siguiente fecha programada, sin stock objetivo.",
    "El stock objetivo de perecibles no es una política optimizada.",
]


class AbastecimientoError(Exception):
    """Entrada inválida o incompleta; el cálculo se detiene."""


# ---------------------------------------------------------------- entradas
def cargar_pronostico(directorio: Path) -> tuple[pd.DataFrame, dict]:
    directorio = Path(directorio)
    try:
        pron = pd.read_csv(directorio / "pronostico_14_dias.csv", parse_dates=["Fecha"])
        meta = json.loads((directorio / "metadata.json").read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise AbastecimientoError(f"Falta un artefacto del pronóstico: {exc.filename}") from exc
    return pron, meta


def validar_pronostico(pron: pd.DataFrame, meta: dict) -> None:
    """Coherencia entre CSV y metadata, y calidad de los valores pronosticados."""
    if meta.get("lote") != LOTE:
        raise AbastecimientoError(f"La metadata corresponde al lote {meta.get('lote')!r}, no a {LOTE!r}.")
    corte = pd.Timestamp(meta["fecha_corte"])
    if corte != CORTE_ESPERADO:
        raise AbastecimientoError(f"Fecha de corte {corte.date()} distinta de la esperada {CORTE_ESPERADO.date()}.")
    horizonte = int(meta["horizonte_dias"])
    fechas = pd.date_range(corte + pd.Timedelta(days=1), periods=horizonte)
    if sorted(pron["Fecha"].unique()) != list(fechas):
        raise AbastecimientoError("Las fechas del CSV no coinciden con el horizonte de la metadata.")
    if len(pron) != FILAS_ESPERADAS or pron.duplicated(["Fecha", "ProductoID"]).any():
        raise AbastecimientoError(f"Se esperaban {FILAS_ESPERADAS} filas sin duplicados; hay {len(pron)}.")
    v = pron["UnidadesPronosticadas"]
    if not np.isfinite(v).all() or (v < 0).any():
        raise AbastecimientoError("Hay pronósticos no finitos o negativos.")
    if (pron.loc[pron["Disponible"] == 0, "UnidadesPronosticadas"] != 0).any():
        raise AbastecimientoError("Hay pronóstico distinto de cero para productos no disponibles.")


def cargar_catalogo(engine, lote: str = LOTE) -> dict:
    """Lote, recetas e insumos (solo SELECT, siempre filtrados por el código de lote)."""
    q = {
        "lote": "SELECT LoteID, Codigo, FechaInicio, FechaFin FROM LFSim_Lote WHERE Codigo = :lote",
        "recetas": """SELECT r.LoteID, r.ProductoID, r.InsumoID, r.CantidadUtilizada
                      FROM LFSim_Receta r JOIN LFSim_Lote l ON l.LoteID = r.LoteID WHERE l.Codigo = :lote""",
        "insumos": """SELECT li.LoteID, li.InsumoID, i.NombreInsumo, u.NombreUnidad AS Unidad,
                             li.StockFinal, i.StockMinimo, i.EsPerecible, i.Estado,
                             li.CostoFijo, li.Politica, li.ProveedorID, p.RazonSocial AS ProveedorPropuesto
                      FROM LFSim_Insumo li JOIN LFSim_Lote l ON l.LoteID = li.LoteID
                      LEFT JOIN Insumo i ON i.InsumoID = li.InsumoID
                      LEFT JOIN UnidadMedida u ON u.UnidadMedidaID = i.UnidadMedidaID
                      LEFT JOIN Proveedor p ON p.ProveedorID = li.ProveedorID
                      WHERE l.Codigo = :lote ORDER BY li.InsumoID""",
    }
    with engine.connect() as con:
        out = {k: pd.read_sql(text(s), con, params={"lote": lote}) for k, s in q.items()}
    if len(out["lote"]) != 1:
        raise AbastecimientoError(f"No se encontró exactamente un lote {lote!r}.")
    out["lote"]["FechaInicio"] = pd.to_datetime(out["lote"]["FechaInicio"])
    out["lote"]["FechaFin"] = pd.to_datetime(out["lote"]["FechaFin"])
    out["recetas"]["CantidadUtilizada"] = out["recetas"]["CantidadUtilizada"].astype(float)
    for c in ("StockFinal", "StockMinimo", "CostoFijo"):
        out["insumos"][c] = out["insumos"][c].astype(float)
    return out


def validar_recetas_insumos(pron: pd.DataFrame, recetas: pd.DataFrame, insumos: pd.DataFrame) -> None:
    """Detiene el cálculo si falta algo; no crea ni completa recetas."""
    productos = set(pron["ProductoID"].unique())
    sin_receta = sorted(int(p) for p in set(pron["ProductoID"].unique()) - set(recetas["ProductoID"].unique()))
    if sin_receta:
        raise AbastecimientoError(f"Productos pronosticados sin receta: {sin_receta}. No se calculan necesidades.")
    if recetas.duplicated(["ProductoID", "InsumoID"]).any():
        raise AbastecimientoError("Hay pares producto–insumo duplicados en la receta.")
    if not (recetas["CantidadUtilizada"] > 0).all():
        raise AbastecimientoError("Hay cantidades de receta no positivas.")
    faltan = sorted(set(recetas["InsumoID"]) - set(insumos["InsumoID"]))
    if faltan:
        raise AbastecimientoError(f"Insumos de recetas ausentes en LFSim_Insumo: {faltan}.")
    malos = insumos[insumos[["NombreInsumo", "Unidad"]].isna().any(axis=1)]
    if len(malos):
        raise AbastecimientoError(f"Insumos sin catálogo o unidad válida: {malos['InsumoID'].tolist()}.")
    if (~insumos["Estado"].astype(bool)).any():
        raise AbastecimientoError("Hay insumos inactivos en el catálogo.")
    desconocidas = sorted(set(insumos["Unidad"]) - set(REDONDEO_UNIDAD))
    if desconocidas:
        raise AbastecimientoError(f"Unidades sin regla de redondeo: {desconocidas}. Configúrelas explícitamente en REDONDEO_UNIDAD.")
    pol = sorted(set(insumos["Politica"]) - set(POLITICAS))
    if pol:
        raise AbastecimientoError(f"Políticas de reposición desconocidas: {pol}.")
    if (insumos[["StockFinal", "StockMinimo", "CostoFijo"]] < 0).any().any():
        raise AbastecimientoError("Hay stocks, mínimos o costos negativos.")


# ---------------------------------------------------------------- necesidades
def calcular_necesidades(pron: pd.DataFrame, recetas: pd.DataFrame, insumos: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Necesidad = UnidadesPronosticadas × CantidadUtilizada, sin redondear. Devuelve (detalle, diarias)."""
    det = pron[["Fecha", "ProductoID", "NombreProducto", "UnidadesPronosticadas"]].merge(
        recetas[["ProductoID", "InsumoID", "CantidadUtilizada"]], on="ProductoID", how="inner", validate="many_to_many")
    det["Necesidad"] = det["UnidadesPronosticadas"] * det["CantidadUtilizada"]
    det = det.merge(insumos[["InsumoID", "NombreInsumo", "Unidad"]], on="InsumoID", validate="many_to_one")
    det = det[["Fecha", "InsumoID", "NombreInsumo", "Unidad", "ProductoID", "NombreProducto",
               "UnidadesPronosticadas", "CantidadUtilizada", "Necesidad"]].sort_values(["Fecha", "InsumoID", "ProductoID"])
    diarias = det.groupby(["Fecha", "InsumoID", "NombreInsumo", "Unidad"], as_index=False)["Necesidad"].sum()
    return det.reset_index(drop=True), diarias


# ---------------------------------------------------------------- políticas
def es_dia_reposicion(politica: str, fecha: pd.Timestamp, anclaje: pd.Timestamp) -> bool:
    """Ciclos de 2, 7 y 14 días anclados a ``anclaje`` (FechaInicio del lote), no al inicio del pronóstico."""
    if politica == "DIARIO":
        return True
    if politica == "MAR-JUE-SAB":
        return fecha.dayofweek in (1, 3, 5)  # martes, jueves, sábado (lunes=0)
    if politica.startswith("CADA-") and politica.endswith("-DIAS"):
        return (fecha - anclaje).days % int(politica.split("-")[1]) == 0
    raise AbastecimientoError(f"Política desconocida: {politica!r}.")


def proxima_reposicion(politica: str, fecha: pd.Timestamp, anclaje: pd.Timestamp) -> pd.Timestamp:
    """Siguiente reposición REAL estrictamente posterior a ``fecha``, aunque caiga fuera del horizonte."""
    for d in range(1, 31):
        cand = pd.Timestamp(fecha) + pd.Timedelta(days=d)
        if es_dia_reposicion(politica, cand, anclaje):
            return cand
    raise AbastecimientoError(f"No se encontró próxima reposición para la política {politica!r}.")


def verificar_calendario(anclaje: pd.Timestamp = pd.Timestamp("2026-04-29")) -> pd.DataFrame:
    """Comprobación con fechas conocidas escritas a mano (no se deriva del código que genera el calendario)."""
    T = pd.Timestamp
    esperado_mjs = [("2026-10-27", "martes", True), ("2026-10-28", "miércoles", False), ("2026-10-29", "jueves", True),
                    ("2026-10-30", "viernes", False), ("2026-10-31", "sábado", True), ("2026-11-01", "domingo", False)]
    for f, dia, ok in esperado_mjs:
        assert es_dia_reposicion("MAR-JUE-SAB", T(f), anclaje) is ok, (f, dia)
    assert es_dia_reposicion("DIARIO", T("2026-11-11"), anclaje)
    # Anclaje 29/04/2026: 28/10 está a 182 días (13 × 14) y 11/11 a 196 (14 × 14).
    assert es_dia_reposicion("CADA-14-DIAS", T("2026-10-28"), anclaje) and es_dia_reposicion("CADA-14-DIAS", T("2026-11-11"), anclaje)
    assert not es_dia_reposicion("CADA-14-DIAS", T("2026-11-10"), anclaje)
    assert es_dia_reposicion("CADA-7-DIAS", T("2026-11-04"), anclaje) and not es_dia_reposicion("CADA-7-DIAS", T("2026-11-05"), anclaje)
    assert es_dia_reposicion("CADA-2-DIAS", T("2026-11-11"), anclaje) and not es_dia_reposicion("CADA-2-DIAS", T("2026-11-10"), anclaje)
    fin = T("2026-11-11")

    def cobertura(pol, f):
        natural = proxima_reposicion(pol, T(f), anclaje) - pd.Timedelta(days=1)
        return natural, min(natural, fin), natural > fin
    assert cobertura("DIARIO", "2026-11-11") == (fin, fin, False)  # próxima 12/11
    assert proxima_reposicion("MAR-JUE-SAB", T("2026-11-10"), anclaje) == T("2026-11-12")  # martes -> jueves
    assert cobertura("MAR-JUE-SAB", "2026-11-10") == (fin, fin, False)
    natural, hasta, trunc = cobertura("CADA-14-DIAS", "2026-11-11")  # próxima 25/11
    assert natural == T("2026-11-24") and hasta == fin and trunc
    return pd.DataFrame([(f, d, ok) for f, d, ok in esperado_mjs], columns=["Fecha", "DiaSemana", "EsMarJueSab"])


def redondear_compra(cantidad: float, unidad: str) -> float:
    """Redondea solo la compra: entero superior o múltiplo superior de 0,001."""
    if unidad not in REDONDEO_UNIDAD:
        raise AbastecimientoError(f"Unidad sin regla de redondeo: {unidad!r}. Configúrela explícitamente.")
    if cantidad <= TOL:
        return 0.0
    if REDONDEO_UNIDAD[unidad] == 1:
        return float(math.ceil(round(cantidad, 9)))
    return round(math.ceil(round(cantidad * 1000, 6)) / 1000, 3)


# ---------------------------------------------------------------- planificación
def _planificar_insumo(fechas, consumo, prog, saldo0, objetivo, unidad, proximas):
    """``proximas[i]``: siguiente reposición real tras fechas[i] (puede estar fuera del horizonte)."""
    n = len(fechas)
    saldo, compras, filas = saldo0, [], []
    for i in range(n):
        antes, compra, tipo = saldo, 0.0, None
        natural = pd.Timestamp(proximas[i]) - pd.Timedelta(days=1)
        trunc = natural > fechas[-1]
        fin = n - 1 if trunc else (natural - fechas[0]).days
        necesidad = float(consumo[i:fin + 1].sum())
        if prog[i]:
            compra = redondear_compra(max(0.0, necesidad + objetivo - saldo), unidad)
            tipo, obj = "Programada", objetivo
        elif saldo + TOL < consumo[i]:
            compra = redondear_compra(max(0.0, necesidad - saldo), unidad)
            tipo, obj = "Urgente propuesta", 0.0
        if compra > 0:
            compras.append(dict(FechaRecepcionPropuesta=fechas[i], TipoPropuesta=tipo, CoberturaHasta=fechas[fin],
                                CoberturaTruncada=bool(trunc), SaldoAntes=antes, NecesidadCobertura=necesidad,
                                StockObjetivo=obj, CantidadSugerida=compra))
        final = saldo + compra - consumo[i]
        if -TOL < final < 0:
            final = 0.0
        filas.append((fechas[i], antes, compra, float(consumo[i]), final))
        saldo = final
    return compras, filas


def planificar(diarias: pd.DataFrame, insumos: pd.DataFrame, fechas, anclaje: pd.Timestamp) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Recorre el horizonte por insumo con saldo arrastrado. Devuelve (propuesta, saldos proyectados)."""
    fechas = list(pd.DatetimeIndex(fechas))
    ancho = diarias.pivot(index="Fecha", columns="InsumoID", values="Necesidad").reindex(fechas).fillna(0.0)
    propuestas, saldos = [], []
    for ins in insumos.itertuples(index=False):
        consumo = (ancho[ins.InsumoID].to_numpy(dtype=float) if ins.InsumoID in ancho.columns else np.zeros(len(fechas)))
        prog = np.array([es_dia_reposicion(ins.Politica, f, anclaje) for f in fechas])
        proximas = [proxima_reposicion(ins.Politica, f, anclaje) for f in fechas]
        compras, filas = _planificar_insumo(fechas, consumo, prog, ins.StockFinal, ins.StockMinimo, ins.Unidad, proximas)
        base = dict(InsumoID=ins.InsumoID, NombreInsumo=ins.NombreInsumo, Unidad=ins.Unidad, Politica=ins.Politica)
        for c in compras:
            c.update(base, CostoUnitarioReferencial=ins.CostoFijo, ImporteEstimado=round(c["CantidadSugerida"] * ins.CostoFijo, 2),
                     ProveedorID=ins.ProveedorID, ProveedorPropuesto=ins.ProveedorPropuesto)
            propuestas.append(c)
        for f in filas:
            saldos.append(dict(Fecha=f[0], InsumoID=ins.InsumoID, NombreInsumo=ins.NombreInsumo, Unidad=ins.Unidad,
                               SaldoInicial=f[1], RecepcionPropuesta=f[2], Consumo=f[3], SaldoFinal=f[4]))
    cols = ["FechaRecepcionPropuesta", "InsumoID", "NombreInsumo", "Unidad", "Politica", "TipoPropuesta", "CoberturaHasta",
            "CoberturaTruncada", "SaldoAntes", "NecesidadCobertura", "StockObjetivo", "CantidadSugerida",
            "CostoUnitarioReferencial", "ImporteEstimado", "ProveedorID", "ProveedorPropuesto"]
    prop = pd.DataFrame(propuestas, columns=cols).sort_values(["FechaRecepcionPropuesta", "InsumoID"]).reset_index(drop=True)
    return prop, pd.DataFrame(saldos)


def advertencias_perecibles(insumos: pd.DataFrame, diarias: pd.DataFrame, n_dias: int) -> pd.DataFrame:
    """Perecibles cuyo stock objetivo equivale a más de UMBRAL_PERECIBLE_DIAS de consumo medio previsto."""
    medio = diarias.groupby("InsumoID")["Necesidad"].sum() / n_dias
    d = insumos[insumos["EsPerecible"].astype(bool)][["InsumoID", "NombreInsumo", "Unidad", "StockMinimo"]].copy()
    d["ConsumoDiarioMedio"] = d["InsumoID"].map(medio).fillna(0.0)
    d["DiasCoberturaObjetivo"] = np.where(d["ConsumoDiarioMedio"] > 0, d["StockMinimo"] / d["ConsumoDiarioMedio"].replace(0, np.nan), np.inf)
    return d[d["DiasCoberturaObjetivo"] > UMBRAL_PERECIBLE_DIAS].reset_index(drop=True)


def resumen_proveedor(prop: pd.DataFrame) -> pd.DataFrame:
    """Cantidades separadas por insumo y unidad; nunca se suman Kg, L y unidades entre sí."""
    return (prop.groupby(["ProveedorID", "ProveedorPropuesto", "InsumoID", "NombreInsumo", "Unidad"], as_index=False)
            .agg(Compras=("CantidadSugerida", "size"), CantidadSugerida=("CantidadSugerida", "sum"), ImporteEstimado=("ImporteEstimado", "sum")))


# ---------------------------------------------------------------- verificación
def verificar_plan(prop: pd.DataFrame, saldos: pd.DataFrame, diarias: pd.DataFrame, detalle: pd.DataFrame,
                   insumos: pd.DataFrame, anclaje: pd.Timestamp) -> dict:
    """Controles del plan; lanza AssertionError si alguno falla."""
    r = {}
    chk = detalle.groupby(["Fecha", "InsumoID"])["Necesidad"].sum().reset_index().merge(diarias, on=["Fecha", "InsumoID"])
    assert np.allclose(chk["Necesidad_x"], chk["Necesidad_y"], atol=1e-9) and len(chk) == len(diarias)
    r["necesidad_agregada_igual_detalle"] = True
    bal = saldos["SaldoInicial"] + saldos["RecepcionPropuesta"] - saldos["Consumo"]
    assert np.allclose(bal, saldos["SaldoFinal"], atol=1e-9)
    r["balance_por_paso"] = True
    s = saldos.sort_values(["InsumoID", "Fecha"])
    sig = s.groupby("InsumoID")["SaldoFinal"].shift()
    assert np.allclose(
        s.loc[sig.notna(), "SaldoInicial"], sig.dropna(), atol=1e-9)
    stock0 = s.groupby("InsumoID")["SaldoInicial"].first()
    assert np.allclose(stock0.sort_index(), insumos.set_index("InsumoID")["StockFinal"].sort_index().reindex(stock0.index), atol=1e-9)
    r["sin_doble_descuento"] = True
    assert (saldos["SaldoFinal"] >= -TOL).all()
    r["sin_saldos_negativos"] = True
    for row in prop.itertuples():
        paso = REDONDEO_UNIDAD[row.Unidad]
        k = row.CantidadSugerida / paso
        assert abs(k - round(k)) < 1e-6, row
    r["redondeo_correcto"] = True
    pol = insumos.set_index("InsumoID")["Politica"]
    prog_ok = prop.apply(lambda x: es_dia_reposicion(pol[x.InsumoID], x.FechaRecepcionPropuesta, anclaje), axis=1)
    assert (prog_ok | (prop["TipoPropuesta"] == "Urgente propuesta")).all()
    assert (prop.loc[prog_ok, "TipoPropuesta"] == "Programada").all()
    r["compras_en_fechas_programadas_o_urgentes"] = True
    ultimo = saldos["Fecha"].max()
    for row in prop.itertuples():
        natural = proxima_reposicion(pol[row.InsumoID], row.FechaRecepcionPropuesta, anclaje) - pd.Timedelta(days=1)
        assert row.CoberturaHasta == min(natural, ultimo), row
        assert bool(row.CoberturaTruncada) == (natural > ultimo), row
    r["cobertura_truncada_coherente"] = True
    r["cobertura_truncada_marcada"] = int(prop["CoberturaTruncada"].sum())
    return r


def verificar_ejemplo_manual() -> pd.DataFrame:
    """Dos casos pequeños con resultado calculado a mano. Lanza AssertionError si el código no los reproduce.

    Caso A (Kg, CADA-2-DIAS, stock 1,0, objetivo 0,5, consumo 2,0/3,0/1,5): día 1 programado cubre días 1-2:
        compra = 5,0 + 0,5 - 1,0 = 4,5; saldo 3,5 -> 0,5. Día 3 programado y truncado: 1,5 + 0,5 - 0,5 = 1,5.
    Caso B (Kg, sin día programado, stock 3,0, objetivo 0,5, consumo 2,0/3,0/1,5): día 2 faltante (1,0 < 3,0)
        -> Urgente propuesta = 4,5 - 1,0 = 3,5 (sin objetivo); saldos 1,0 -> 1,5 -> 0.
    Caso C (Unidad): necesidad 2,2 con stock 0 -> compra 3 (entero superior).
    """
    f = pd.date_range("2026-01-01", periods=3)
    cons = np.array([2.0, 3.0, 1.5])
    d = pd.Timedelta(days=1)
    a, fa = _planificar_insumo(f, cons, np.array([True, False, True]), 1.0, 0.5, "Kilogramo (Kg)", [f[2], f[2], f[2] + 2 * d])
    assert [c["CantidadSugerida"] for c in a] == [4.5, 1.5] and [c["CoberturaTruncada"] for c in a] == [False, True]
    assert np.allclose([x[4] for x in fa], [3.5, 0.5, 0.5])
    b, fb = _planificar_insumo(f, cons, np.array([False, False, False]), 3.0, 0.5, "Kilogramo (Kg)", [f[2] + 5 * d] * 3)
    assert [(c["TipoPropuesta"], c["CantidadSugerida"], c["FechaRecepcionPropuesta"]) for c in b] == [("Urgente propuesta", 3.5, f[1])]
    assert np.allclose([x[4] for x in fb], [1.0, 1.5, 0.0])
    c, _ = _planificar_insumo(f[:1], np.array([2.2]), np.array([True]), 0.0, 0.0, "Unidad (Und)", [f[0] + d])
    assert c[0]["CantidadSugerida"] == 3.0 and not c[0]["CoberturaTruncada"]
    assert redondear_compra(1.2341, "Litro (L)") == 1.235 and redondear_compra(4.0, "Botella / Frasco") == 4.0
    return pd.DataFrame([dict(caso="A", compras=len(a), esperado="4,5 y 1,5"), dict(caso="B", compras=len(b), esperado="Urgente 3,5"),
                         dict(caso="C", compras=len(c), esperado="3 unidades")])


# ---------------------------------------------------------------- salida
def guardar_resultados(directorio: Path, detalle, diarias, prop, saldos, metadata: dict) -> None:
    directorio = Path(directorio)
    directorio.mkdir(parents=True, exist_ok=True)

    def f(df, cols):
        out = df.copy()
        for c in cols:
            out[c] = pd.to_datetime(out[c]).dt.strftime("%Y-%m-%d")
        return out
    f(diarias, ["Fecha"]).to_csv(directorio / "necesidades_diarias.csv", index=False)
    f(detalle, ["Fecha"]).to_csv(directorio / "necesidades_detalle.csv", index=False)
    f(prop, ["FechaRecepcionPropuesta", "CoberturaHasta"]).to_csv(directorio / "propuesta_abastecimiento.csv", index=False)
    f(saldos, ["Fecha"]).to_csv(directorio / "saldos_proyectados.csv", index=False)
    (directorio / "metadata_abastecimiento.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")


def construir_metadata(meta_pron: dict, lote: pd.Series, fechas, anclaje: pd.Timestamp, insumos: pd.DataFrame) -> dict:
    return {
        "lote": LOTE,
        "fecha_corte": meta_pron["fecha_corte"],
        "horizonte": [str(pd.Timestamp(min(fechas)).date()), str(pd.Timestamp(max(fechas)).date())],
        "horizonte_dias": len(fechas),
        "fuente_pronostico": "artifacts/demanda/pronostico_14_dias.csv (XGBoost)",
        "fuente_stock_inicial": "LFSim_Insumo.StockFinal al cierre del corte",
        "fuente_recetas": "LFSim_Receta (fotografía del lote)",
        "anclaje_politicas": str(pd.Timestamp(anclaje).date()) + " (LFSim_Lote.FechaInicio)",
        "politicas": {p: "días anclados a FechaInicio" if p.startswith("CADA") else ("todos los días" if p == "DIARIO" else "martes, jueves y sábado")
                      for p in POLITICAS},
        "redondeo": {"Unidad y Botella/Frasco": "entero superior", "Kg y Litro": "múltiplo superior de 0,001",
                     "solo_se_redondea": "la cantidad comprada; necesidades y saldos conservan precisión"},
        "formula_compra": "max(0, consumo de cobertura + StockMinimo - saldo disponible)",
        "tipos_propuesta": ["Programada", "Urgente propuesta"],
        "insumos": int(len(insumos)),
        "supuestos": SUPUESTOS,
        "nota": "Recepciones hipotéticas: no cambian existencias ni son compras aprobadas.",
    }
