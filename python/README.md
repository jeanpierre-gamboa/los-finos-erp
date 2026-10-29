# Planificación de demanda — componente Python

Preparación del entorno, conexión de **solo lectura** a SQL Server y exploración del historial sintético `LF-DEMANDA-V1` (vista `dbo.LFSim_DemandaDiaria`).

**Alcance de esta entrega:** exploración y validación de datos. No hay modelos entrenados ni conexión con el frontend. **Siguiente etapa:** entrenamiento y evaluación temporal (validación dentro del período de desarrollo 29/04–30/09/2026; la prueba 01/10–28/10/2026 queda reservada).

## Estructura

```
python/
  notebooks/01_exploracion_demanda.ipynb
  src/losfinos_demanda/   config.py (conexión), datos.py (carga y validación), graficos.py
  requirements.txt
  .env.example
```

## Entorno y kernel

- Entorno conda: `losfinos-demanda` (Python 3.11).
- Kernel de Jupyter: **Python (Los Finos Demanda)**.

Instalación en otra máquina:

```powershell
conda create -n losfinos-demanda python=3.11
conda activate losfinos-demanda
pip install -r python/requirements.txt
python -m ipykernel install --user --name losfinos-demanda --display-name "Python (Los Finos Demanda)"
```

## Configuración local

- Requiere **ODBC Driver 18 for SQL Server** y acceso con autenticación integrada de Windows (no se usan usuario ni contraseña SQL).
- Se leen `DB_SERVER` y `DB_DATABASE` desde variables de entorno. Se buscan en `python/.env` y, si no existe, en `backend/.env`, sin importar desde dónde se abra JupyterLab. Para valores propios, copie `.env.example` a `python/.env` (no se versiona).
- `DB_ODBC_DRIVER` es opcional (por defecto, Driver 18).
- La conexión rechaza cualquier sentencia que no sea `SELECT`/`WITH`.

## Ejecutar el notebook

```powershell
conda activate losfinos-demanda
cd python
jupyter lab
```

Abra `notebooks/01_exploracion_demanda.ipynb`, elija el kernel **Python (Los Finos Demanda)** y use *Reiniciar kernel y ejecutar todo*.

## Notebook 02: pronóstico con XGBoost

`notebooks/02_pronostico_xgboost.ipynb` (lógica en `src/losfinos_demanda/modelo.py`) entrena un `XGBRegressor` global con parámetros fijos, pronostica 14 días de forma recursiva y lo compara con una referencia (promedio de las últimas 4 observaciones del mismo día de la semana). Se ejecuta igual que el 01, con el mismo kernel.

- Validación en 3 bloques (orígenes 19/08, 02/09, 16/09) y prueba final en 2 (30/09 y 14/10, con reentrenamiento quincenal de ventana creciente).
- Pronóstico final: 29/10–11/11/2026, reentrenado con todo el historial.
- La disponibilidad futura de los menús 6 y 7 es un supuesto configurable (`ReglaDisponibilidad`, alternancia anclada al 29/04/2026).
- Genera en `artifacts/demanda/` (ignorado por git): `pronostico_14_dias.csv`, `metricas.csv`, `modelo_xgboost.joblib` y `metadata.json`. El modelo guardado no basta por sí solo: predecir exige además la historia reciente de ventas (hasta 28 días).
- `objective="reg"` no es válido en XGBoost; se usa `reg:squarederror`.
- Resultado: productos vendidos previstos, no cantidades de insumos.

## Notebook 03: plan de abastecimiento

`notebooks/03_plan_abastecimiento.ipynb` (lógica en `src/losfinos_demanda/abastecimiento.py`) convierte el pronóstico del notebook 02 en necesidades de insumos (recetas `LFSim_Receta`) y propone compras según la política de reposición de cada insumo (ciclos anclados al 29/04/2026). Requiere haber generado antes `artifacts/demanda/`. Solo lee SQL Server.

- Stock inicial: `LFSim_Insumo.StockFinal` al cierre del 28/10 (no `Insumo.StockActual`); `StockMinimo` es un objetivo provisional.
- Las recepciones son hipotéticas, con plazo de entrega cero y sin órdenes pendientes, mínimos comerciales ni mermas. Los importes son referenciales, no cotizaciones.
- Salidas en `artifacts/abastecimiento/` (ignorado por git): `necesidades_diarias.csv`, `necesidades_detalle.csv`, `propuesta_abastecimiento.csv`, `saldos_proyectados.csv` y `metadata_abastecimiento.json`.

## Notas

- Los datos son sintéticos: los resultados demostrarán el método, no precisión sobre ventas reales.
- El notebook usa solo el lote `LF-DEMANDA-V1`; no incluye pedidos nuevos de la aplicación ni análisis por canal (la vista no tiene `CanalID`).
