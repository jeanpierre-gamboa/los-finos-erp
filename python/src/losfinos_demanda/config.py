"""Configuración y conexión de solo lectura a SQL Server.

Los valores se leen de variables de entorno. Se buscan, sin importar el
directorio de trabajo, en ``python/.env`` y, como respaldo, en ``backend/.env``
(sin copiarlos ni mostrarlos). Se usa autenticación integrada de Windows.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL, Engine

PYTHON_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = PYTHON_DIR.parent
ENV_FILES = (PYTHON_DIR / ".env", REPO_ROOT / "backend" / ".env")
DEFAULT_DRIVER = "ODBC Driver 18 for SQL Server"


class ConfigError(RuntimeError):
    """Configuración ausente o inválida."""


class ConexionError(RuntimeError):
    """No se pudo conectar a SQL Server."""


@dataclass(frozen=True)
class DbConfig:
    server: str
    database: str
    driver: str = DEFAULT_DRIVER

    def __repr__(self) -> str:  # evita volcar valores de conexión en salidas
        return f"DbConfig(driver={self.driver!r}, server=<oculto>, database=<oculta>)"


def cargar_entorno() -> None:
    """Carga los .env existentes sin sobrescribir variables ya definidas."""
    for env_file in ENV_FILES:
        if env_file.is_file():
            load_dotenv(env_file, override=False)


def leer_configuracion() -> DbConfig:
    cargar_entorno()
    server = os.getenv("DB_SERVER", "").strip()
    database = os.getenv("DB_DATABASE", "").strip()
    faltantes = [n for n, v in (("DB_SERVER", server), ("DB_DATABASE", database)) if not v]
    if faltantes:
        raise ConfigError(
            f"Faltan variables de entorno: {', '.join(faltantes)}. "
            "Defínalas en python/.env (vea python/.env.example) o en backend/.env."
        )
    driver = os.getenv("DB_ODBC_DRIVER", DEFAULT_DRIVER).strip() or DEFAULT_DRIVER
    return DbConfig(server=server, database=database, driver=driver)


def verificar_driver(driver: str) -> None:
    import pyodbc

    instalados = pyodbc.drivers()
    if driver not in instalados:
        raise ConfigError(
            f"El driver ODBC '{driver}' no está instalado. "
            f"Drivers disponibles: {', '.join(instalados) or 'ninguno'}."
        )


def _solo_lectura(engine: Engine) -> None:
    """Rechaza cualquier sentencia que no sea una consulta (SELECT/WITH)."""

    @event.listens_for(engine, "before_cursor_execute")
    def _guardia(conn, cursor, statement, parameters, context, executemany):
        inicio = statement.lstrip().split(None, 1)[0].upper() if statement.strip() else ""
        if inicio not in {"SELECT", "WITH"}:
            raise PermissionError("Conexión de solo lectura: solo se permiten consultas SELECT.")


def crear_engine(config: DbConfig | None = None) -> Engine:
    config = config or leer_configuracion()
    verificar_driver(config.driver)
    cadena = (
        f"Driver={{{config.driver}}};Server={config.server};Database={config.database};"
        "Trusted_Connection=Yes;TrustServerCertificate=Yes;ApplicationIntent=ReadOnly;"
    )
    engine = create_engine(URL.create("mssql+pyodbc", query={"odbc_connect": cadena}))
    _solo_lectura(engine)
    return engine


def probar_conexion(engine: Engine) -> None:
    """Verifica la conexión y traduce los fallos a mensajes claros."""
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except DBAPIError as exc:
        raise ConexionError(
            "No se pudo conectar a SQL Server. Revise que el servicio esté activo, "
            "que DB_SERVER/DB_DATABASE sean correctos y que su usuario de Windows tenga acceso."
        ) from exc.orig
