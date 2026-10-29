"""Gráficos de exploración del historial de demanda (solo visualización)."""

from __future__ import annotations

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from .datos import MENUS_ALTERNANTES, PRODUCTOS_PLATO, es_plato, platos_por_dia

AZUL, NARANJA = "#1b365d", "#e85d04"
NOMBRES_DIA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def estilo() -> None:
    sns.set_theme(style="whitegrid", context="notebook")
    plt.rcParams.update({"figure.dpi": 100, "axes.titleweight": "bold"})


def serie_diaria_platos(df: pd.DataFrame):
    serie = platos_por_dia(df)
    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(serie.index, serie.values, color=AZUL, linewidth=1, label="Platos por día")
    ax.plot(serie.index, serie.rolling(7, center=True).mean(), color=NARANJA, linewidth=2, label="Media móvil 7 días")
    ax.set(title="Platos vendidos por día (ProductoID 1-7)", xlabel="Fecha", ylabel="Platos")
    ax.legend()
    fig.tight_layout()
    return fig


def unidades_por_producto(df: pd.DataFrame):
    tot = (df.groupby(["ProductoID", "NombreProducto"], as_index=False)["UnidadesVendidas"].sum()
             .assign(Tipo=lambda d: d["ProductoID"].isin(PRODUCTOS_PLATO).map({True: "Plato", False: "Bebida/extra"}))
             .sort_values("ProductoID"))
    fig, ax = plt.subplots(figsize=(10, 4.5))
    sns.barplot(data=tot, y="NombreProducto", x="UnidadesVendidas", hue="Tipo",
                palette={"Plato": AZUL, "Bebida/extra": NARANJA}, dodge=False, ax=ax)
    ax.set(title="Unidades vendidas por producto", xlabel="Unidades vendidas", ylabel="")
    fig.tight_layout()
    return fig


def promedio_por_dia_semana(df: pd.DataFrame):
    por_dia = platos_por_dia(df).rename("Platos").reset_index()
    por_dia["DiaSemana"] = por_dia["Fecha"].dt.dayofweek
    media = por_dia.groupby("DiaSemana")["Platos"].mean().reindex(range(7))
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar(NOMBRES_DIA, media.values, color=AZUL)
    ax.set(title="Promedio de platos vendidos por día de la semana", ylabel="Platos por día")
    fig.tight_layout()
    return fig


def menus_y_disponibilidad(df: pd.DataFrame):
    menus = df[df["ProductoID"].isin(MENUS_ALTERNANTES)]
    ventas = menus.pivot(index="Fecha", columns="NombreProducto", values="UnidadesVendidas")
    disp = menus.pivot(index="Fecha", columns="NombreProducto", values="Disponible")
    fig, axes = plt.subplots(2, 1, figsize=(11, 6), sharex=True, gridspec_kw={"height_ratios": [2, 1]})
    for col, color in zip(ventas.columns, (AZUL, NARANJA)):
        axes[0].plot(ventas.index, ventas[col], label=col, color=color, linewidth=1)
        axes[1].step(disp.index, disp[col] + (0.05 if color == NARANJA else 0), where="post", color=color)
    axes[0].set(title="Menús alternantes: unidades vendidas", ylabel="Unidades")
    axes[0].legend()
    axes[1].set(title="Disponibilidad (1 = disponible)", ylabel="Disponible", yticks=[0, 1])
    fig.tight_layout()
    return fig


def resumen_menus(df: pd.DataFrame) -> pd.DataFrame:
    menus = df[df["ProductoID"].isin(MENUS_ALTERNANTES)]
    return menus.groupby(["ProductoID", "NombreProducto"]).agg(
        DiasDisponible=("Disponible", "sum"),
        DiasNoDisponible=("Disponible", lambda s: int((s == 0).sum())),
        UnidadesVendidas=("UnidadesVendidas", "sum"),
    ).reset_index()
