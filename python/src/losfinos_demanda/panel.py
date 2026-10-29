"""Exporta los artefactos de demanda y abastecimiento a un único JSON para el panel del ERP.

Solo lee CSV/JSON ya generados: no consulta ni escribe en SQL Server, no entrena ni ejecuta notebooks.
Uso (desde python/):  python src/losfinos_demanda/panel.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]
DIR_DEMANDA = RAIZ / "artifacts" / "demanda"
DIR_ABAST = RAIZ / "artifacts" / "abastecimiento"
SALIDA = RAIZ / "artifacts" / "panel" / "panel_planificacion.json"

PRODUCTOS_PLATO = tuple(range(1, 8))  # bebidas y extras (8-10) no cuentan como platos
FECHA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

COLUMNAS = {
    "pronostico": ["Fecha", "ProductoID", "NombreProducto", "Disponible", "UnidadesPronosticadas"],
    "metricas": ["Etapa", "Bloque", "Metodo", "Alcance", "ProductoID", "Filas", "MAE", "WAPE"],
    "necesidades": ["Fecha", "InsumoID", "NombreInsumo", "Unidad", "Necesidad"],
    "propuestas": ["FechaRecepcionPropuesta", "InsumoID", "NombreInsumo", "Unidad", "Politica", "TipoPropuesta",
                   "CoberturaHasta", "CoberturaTruncada", "SaldoAntes", "NecesidadCobertura", "StockObjetivo",
                   "CantidadSugerida", "CostoUnitarioReferencial", "ImporteEstimado", "ProveedorID", "ProveedorPropuesto"],
    "saldos": ["Fecha", "InsumoID", "NombreInsumo", "Unidad", "SaldoInicial", "RecepcionPropuesta", "Consumo", "SaldoFinal"],
}
ARCHIVOS = {
    "pronostico": DIR_DEMANDA / "pronostico_14_dias.csv",
    "metricas": DIR_DEMANDA / "metricas.csv",
    "necesidades": DIR_ABAST / "necesidades_diarias.csv",
    "propuestas": DIR_ABAST / "propuesta_abastecimiento.csv",
    "saldos": DIR_ABAST / "saldos_proyectados.csv",
}


class PanelError(Exception):
    """Artefactos ausentes, incompletos o incompatibles entre sí."""


def _leer_json(ruta: Path) -> dict:
    if not ruta.is_file():
        raise PanelError(f"Falta el archivo {ruta}")
    return json.loads(ruta.read_text(encoding="utf-8"))


def _leer_csv(nombre: str, fechas: list[str]) -> pd.DataFrame:
    ruta = ARCHIVOS[nombre]
    if not ruta.is_file():
        raise PanelError(f"Falta el archivo {ruta}")
    df = pd.read_csv(ruta, encoding="utf-8")
    faltan = [c for c in COLUMNAS[nombre] if c not in df.columns]
    if faltan:
        raise PanelError(f"{ruta.name}: faltan columnas {faltan}")
    df = df[COLUMNAS[nombre]]
    for c in fechas:
        if not df[c].astype(str).map(lambda s: bool(FECHA_RE.match(s))).all():
            raise PanelError(f"{ruta.name}: la columna {c} contiene fechas que no son AAAA-MM-DD")
    return df


def _finitos(df: pd.DataFrame, columnas: list[str], nombre: str) -> None:
    for c in columnas:
        v = pd.to_numeric(df[c], errors="coerce")
        if v.isna().any() or not np.isfinite(v).all():
            raise PanelError(f"{nombre}: la columna {c} contiene valores ausentes o no finitos")


def _filas(df: pd.DataFrame, renombrar: dict[str, str]) -> list[dict]:
    """Registros JSON: NaN -> None y tipos nativos de Python."""
    out = []
    for fila in df.rename(columns=renombrar).to_dict("records"):
        limpio = {}
        for k, v in fila.items():
            if isinstance(v, (np.bool_, bool)):
                v = bool(v)
            elif isinstance(v, (np.integer,)):
                v = int(v)
            elif isinstance(v, (np.floating, float)):
                v = None if not np.isfinite(v) else float(v)
            elif v is None or (not isinstance(v, str) and pd.isna(v)):
                v = None
            limpio[k] = v
        out.append(limpio)
    return out


def _metricas(met: pd.DataFrame) -> dict:
    """MAE/WAPE agregados de todos los bloques de cada etapa; WAPE no calculable queda en null."""
    sel = met[(met["Bloque"] == "Todos los bloques") & met["Alcance"].isin(["Global", "Solo días disponibles"])]
    clave = {"Global": "global", "Solo días disponibles": "diasDisponibles"}
    etapas = {"Validación": "validacion", "Prueba": "prueba"}
    out: dict = {}
    for r in sel.itertuples():
        if r.Etapa not in etapas:
            continue
        mae = None if not np.isfinite(r.MAE) else float(r.MAE)
        wape = None if not np.isfinite(r.WAPE) else float(r.WAPE)
        out.setdefault(etapas[r.Etapa], {}).setdefault(r.Metodo.lower(), {})[clave[r.Alcance]] = {"mae": mae, "wape": wape}
    for etapa in etapas.values():
        for metodo in ("xgboost", "referencia"):
            if set(out.get(etapa, {}).get(metodo, {})) != {"global", "diasDisponibles"}:
                raise PanelError(f"metricas.csv: faltan métricas de {metodo} en {etapa}")
    return out


def construir_panel() -> dict:
    meta_d = _leer_json(DIR_DEMANDA / "metadata.json")
    meta_a = _leer_json(DIR_ABAST / "metadata_abastecimiento.json")
    if meta_d.get("lote") != meta_a.get("lote"):
        raise PanelError(f"Lotes distintos: demanda {meta_d.get('lote')!r}, abastecimiento {meta_a.get('lote')!r}")
    if meta_d.get("fecha_corte") != meta_a.get("fecha_corte"):
        raise PanelError("La fecha de corte de demanda y abastecimiento no coincide")
    corte = pd.Timestamp(meta_d["fecha_corte"])
    dias = int(meta_d["horizonte_dias"])
    if int(meta_a["horizonte_dias"]) != dias:
        raise PanelError("El horizonte de demanda y abastecimiento no coincide")
    fechas = [d.strftime("%Y-%m-%d") for d in pd.date_range(corte + pd.Timedelta(days=1), periods=dias)]
    if meta_a["horizonte"] != [fechas[0], fechas[-1]]:
        raise PanelError("El horizonte de la metadata de abastecimiento no corresponde al corte")

    pron = _leer_csv("pronostico", ["Fecha"])
    met = _leer_csv("metricas", [])
    nec = _leer_csv("necesidades", ["Fecha"])
    prop = _leer_csv("propuestas", ["FechaRecepcionPropuesta", "CoberturaHasta"])
    sal = _leer_csv("saldos", ["Fecha"])

    # Pronóstico
    _finitos(pron, ["UnidadesPronosticadas", "Disponible", "ProductoID"], "pronostico")
    if (pron["UnidadesPronosticadas"] < 0).any():
        raise PanelError("pronostico: hay unidades pronosticadas negativas")
    if pron.duplicated(["Fecha", "ProductoID"]).any() or len(pron) != dias * 10:
        raise PanelError(f"pronostico: se esperaban {dias * 10} filas sin duplicados, hay {len(pron)}")
    if sorted(pron["Fecha"].unique()) != fechas:
        raise PanelError("pronostico: las fechas no coinciden con el horizonte")
    if (pron.loc[pron["Disponible"] == 0, "UnidadesPronosticadas"] != 0).any():
        raise PanelError("pronostico: hay pronóstico positivo para productos no disponibles")

    # Necesidades, saldos y propuestas
    _finitos(nec, ["Necesidad", "InsumoID"], "necesidades")
    _finitos(sal, ["SaldoInicial", "RecepcionPropuesta", "Consumo", "SaldoFinal", "InsumoID"], "saldos")
    _finitos(prop, ["SaldoAntes", "NecesidadCobertura", "StockObjetivo", "CantidadSugerida", "CostoUnitarioReferencial",
                    "ImporteEstimado", "ProveedorID", "InsumoID"], "propuestas")
    if (nec["Necesidad"] < 0).any() or (sal["SaldoFinal"] < -1e-9).any():
        raise PanelError("Hay necesidades negativas o saldos proyectados negativos")
    if sorted(nec["Fecha"].unique()) != fechas or sorted(sal["Fecha"].unique()) != fechas:
        raise PanelError("necesidades/saldos: las fechas no coinciden con el horizonte")
    if not prop["FechaRecepcionPropuesta"].isin(fechas).all():
        raise PanelError("propuestas: hay fechas de recepción fuera del horizonte")
    if not prop["TipoPropuesta"].isin(["Programada", "Urgente propuesta"]).all():
        raise PanelError("propuestas: tipo de propuesta desconocido")
    insumos = set(sal["InsumoID"])
    if not set(nec["InsumoID"]) <= insumos or not set(prop["InsumoID"]) <= insumos:
        raise PanelError("Hay insumos en necesidades o propuestas sin saldo proyectado")
    unidades = sal.groupby("InsumoID")["Unidad"].nunique()
    if (unidades != 1).any():
        raise PanelError("saldos: un insumo tiene más de una unidad")
    prop["CoberturaTruncada"] = prop["CoberturaTruncada"].astype(bool)

    # Coherencia entre archivos y metadata
    res = meta_a["resumen"]
    if len(prop) != res["compras"] or int((prop["TipoPropuesta"] == "Urgente propuesta").sum()) != res["urgentes"]:
        raise PanelError("La propuesta no coincide con el resumen de la metadata de abastecimiento")
    if abs(float(prop["ImporteEstimado"].sum()) - float(res["importe_estimado_total"])) > 0.01:
        raise PanelError("El importe de la propuesta no coincide con la metadata de abastecimiento")
    consumo_nec = nec.groupby(["Fecha", "InsumoID"])["Necesidad"].sum()
    consumo_sal = sal.set_index(["Fecha", "InsumoID"])["Consumo"]
    if not np.allclose(consumo_nec.sort_index(), consumo_sal.reindex(consumo_nec.index).sort_index(), atol=1e-6):
        raise PanelError("Las necesidades diarias no coinciden con el consumo de los saldos proyectados")

    nombres = pron.drop_duplicates("ProductoID").sort_values("ProductoID")
    productos = [{"id": int(r.ProductoID), "nombre": r.NombreProducto, "esPlato": int(r.ProductoID) in PRODUCTOS_PLATO}
                 for r in nombres.itertuples()]
    insumos_lista = [{"id": int(i), "nombre": g["NombreInsumo"].iloc[0], "unidad": g["Unidad"].iloc[0]}
                     for i, g in sal.sort_values("InsumoID").groupby("InsumoID")]

    return {
        "meta": {
            "exportadoEn": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "escenario": "Escenario simulado",
            "lote": meta_d["lote"],
            "fechaCorte": meta_d["fecha_corte"],
            "periodo": {"desde": fechas[0], "hasta": fechas[-1]},
            "horizonteDias": dias,
            "modelo": "XGBoost global (parámetros fijos)",
            "fuenteStockInicial": meta_a["fuente_stock_inicial"],
            "fuenteRecetas": meta_a["fuente_recetas"],
            "anclajePoliticas": meta_a["anclaje_politicas"],
            "supuestos": meta_a["supuestos"],
            "notaAbastecimiento": meta_a["nota"],
            "versiones": meta_d.get("versiones", {}),
            "resumenAbastecimiento": {"lineas": int(res["compras"]), "urgentes": int(res["urgentes"]),
                                      "insumosConReposicion": len(res["insumos_con_compra"]),
                                      "importeEstimado": float(res["importe_estimado_total"])},
        },
        "productos": productos,
        "insumos": insumos_lista,
        "metricas": _metricas(met),
        "pronostico": _filas(pron, {"Fecha": "fecha", "ProductoID": "productoId", "NombreProducto": "producto",
                                    "Disponible": "disponible", "UnidadesPronosticadas": "unidades"}),
        "necesidades": _filas(nec, {"Fecha": "fecha", "InsumoID": "insumoId", "NombreInsumo": "insumo",
                                    "Unidad": "unidad", "Necesidad": "necesidad"}),
        "propuestas": _filas(prop, {"FechaRecepcionPropuesta": "fecha", "InsumoID": "insumoId", "NombreInsumo": "insumo",
                                    "Unidad": "unidad", "Politica": "politica", "TipoPropuesta": "tipo",
                                    "CoberturaHasta": "coberturaHasta", "CoberturaTruncada": "coberturaTruncada",
                                    "SaldoAntes": "saldoAntes", "NecesidadCobertura": "necesidadCobertura",
                                    "StockObjetivo": "stockObjetivo", "CantidadSugerida": "cantidad",
                                    "CostoUnitarioReferencial": "costoUnitario", "ImporteEstimado": "importe",
                                    "ProveedorID": "proveedorId", "ProveedorPropuesto": "proveedor"}),
        "saldos": _filas(sal, {"Fecha": "fecha", "InsumoID": "insumoId", "NombreInsumo": "insumo", "Unidad": "unidad",
                               "SaldoInicial": "saldoInicial", "RecepcionPropuesta": "recepcion", "Consumo": "consumo",
                               "SaldoFinal": "saldoFinal"}),
    }


def escribir_atomico(panel: dict, destino: Path = SALIDA) -> Path:
    """Escribe en un temporal del mismo directorio y reemplaza: el JSON nunca queda a medias."""
    texto = json.dumps(panel, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    destino.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=destino.parent, prefix=".panel_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(texto)
        os.replace(tmp, destino)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return destino


def main() -> int:
    try:
        ruta = escribir_atomico(construir_panel())
    except PanelError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(f"Panel exportado: {ruta} ({ruta.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
