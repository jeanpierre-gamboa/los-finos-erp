import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Field, Notice, Panel, Tabs } from '../components.jsx'
import {
  compraSinRedondeo, descargarCsv, diaSemana, esPanelValido, filtrarPropuestas, fmtExportado, fmtFecha, fmtFechaCorta, fmtNum,
  fmtPct, fmtSoles, importePorProveedor, indicadores, propuestasACsv, stockObjetivoInsumo, sumar, totalesPorProducto, unidadCorta,
} from './planificacionUtils.js'

const API_URL = 'http://localhost:3000/api'
const NAVY = '#1b365d'
const ORANGE = '#e85d04'
const GRID = '#e6ecf3'

const TABS = [
  { id: 'demanda', label: 'Demanda' },
  { id: 'necesidades', label: 'Necesidades y stock' },
  { id: 'propuesta', label: 'Propuesta de abastecimiento' },
]

function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`pl-kpi ${tone ? `is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  )
}

function ChartBox({ children, label }) {
  return (
    <div className="pl-chart" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  )
}

function Cabecera({ meta, onRefresh, refreshing }) {
  return (
    <div className="pl-head">
      <div className="pl-head-info">
        <div className="pl-badges">
          <span className="pl-badge is-sim">{meta.escenario}</span>
          <span className="pl-badge">Lote {meta.lote}</span>
        </div>
        <p><strong>Período pronosticado:</strong> {fmtFecha(meta.periodo.desde)} – {fmtFecha(meta.periodo.hasta)} ({meta.horizonteDias} días)</p>
        <p><strong>Corte del histórico:</strong> {fmtFecha(meta.fechaCorte)}</p>
        <p><strong>Resultados exportados:</strong> {fmtExportado(meta.exportadoEn)} (hora de Lima)</p>
      </div>
      <button type="button" className="lg-btn" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Actualizando…' : 'Actualizar resultados'}
      </button>
    </div>
  )
}

function Indicadores({ ind }) {
  return (
    <div className="pl-kpis">
      <Kpi label="Platos previstos · 7 días" value={fmtNum(ind.platos7, 1)} hint="Productos 1–7; sin bebidas ni extras" />
      <Kpi label="Platos previstos · 14 días" value={fmtNum(ind.platos14, 1)} hint="Productos 1–7; sin bebidas ni extras" />
      <Kpi label="Importe estimado de abastecimiento" value={fmtSoles(ind.importe)} hint={`${ind.lineas} líneas propuestas · referencial`} />
      <Kpi label="Líneas urgentes propuestas" value={ind.urgentes} hint="Líneas de propuesta, no órdenes de compra" tone={ind.urgentes > 0 ? 'warn' : 'ok'} />
      <Kpi label="Insumos con reposición sugerida" value={`${ind.insumosReposicion} de ${ind.insumosTotales}`} hint="Con al menos una línea propuesta" tone="ok" />
    </div>
  )
}

function TooltipDemanda({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="pl-tooltip">
      <strong>{diaSemana(d.fecha)} {fmtFecha(d.fecha)}</strong>
      <span>Pronóstico: {fmtNum(d.unidades, 1)} unidades</span>
      {d.disponible === 0 ? <em>Producto no disponible ese día</em> : null}
    </div>
  )
}

function Demanda({ data }) {
  const [productoId, setProductoId] = useState(data.productos[0].id)
  const producto = data.productos.find((p) => p.id === productoId) || data.productos[0]
  const serie = useMemo(() => data.pronostico.filter((r) => r.productoId === producto.id), [data.pronostico, producto.id])
  const totales = useMemo(() => totalesPorProducto(data.pronostico, data.productos, data.meta.periodo.desde), [data])
  const platos = totales.filter((p) => p.esPlato)

  return (
    <>
      <Panel title="Pronóstico diario por producto" description="Unidades vendidas previstas por el modelo. No hay ventas observadas en este período: todo lo mostrado es pronóstico.">
        <div className="lg-form-row pl-select-row">
          <Field label="Producto">
            <select value={producto.id} onChange={(e) => setProductoId(Number(e.target.value))}>
              {data.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.esPlato ? '' : ' (bebida/extra)'}</option>)}
            </select>
          </Field>
        </div>
        <ChartBox label={`Pronóstico diario de ${producto.nombre}`}>
          <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="fecha" tickFormatter={fmtFechaCorta} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={44} label={{ value: 'Unidades', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <Tooltip content={<TooltipDemanda />} />
            <Legend />
            <Line type="monotone" dataKey="unidades" name="Unidades pronosticadas" stroke={ORANGE} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ChartBox>
      </Panel>

      <Panel title="Resumen de los 10 productos" description="Totales pronosticados. Los platos son los productos 1–7; bebidas y extras se muestran aparte.">
        <div className="lg-table-wrap">
          <table className="lg-table" aria-label="Pronóstico por producto">
            <thead><tr><th scope="col">Producto</th><th scope="col">Tipo</th><th scope="col" className="num">7 días</th><th scope="col" className="num">14 días</th><th scope="col" className="num">Días disponibles</th></tr></thead>
            <tbody>
              {totales.map((p) => (
                <tr key={p.id} className={p.id === producto.id ? 'is-selected' : ''}>
                  <td>{p.nombre}</td>
                  <td>{p.esPlato ? 'Plato' : 'Bebida / extra'}</td>
                  <td className="num">{fmtNum(p.dias7, 1)}</td>
                  <td className="num">{fmtNum(p.dias14, 1)}</td>
                  <td className="num">{p.diasDisponibles} de {p.diasTotales}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row" colSpan={2}>Total platos (productos 1–7)</th><td className="num">{fmtNum(sumar(platos, 'dias7'), 1)}</td><td className="num">{fmtNum(sumar(platos, 'dias14'), 1)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </>
  )
}

function TooltipSaldo({ active, payload, unidad }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="pl-tooltip">
      <strong>{diaSemana(d.fecha)} {fmtFecha(d.fecha)}</strong>
      <span>Consumo previsto: {fmtNum(d.consumo, 3)} {unidad}</span>
      <span>Saldo final proyectado: {fmtNum(d.saldoFinal, 3)} {unidad}</span>
      {d.recepcion > 0 ? <em>Incluye recepción hipotética de {fmtNum(d.recepcion, 3)} {unidad}</em> : null}
    </div>
  )
}

function Necesidades({ data }) {
  const [insumoId, setInsumoId] = useState(data.insumos[0].id)
  const insumo = data.insumos.find((i) => i.id === insumoId) || data.insumos[0]
  const unidad = unidadCorta(insumo.unidad)
  const serie = useMemo(() => data.saldos.filter((r) => r.insumoId === insumo.id), [data.saldos, insumo.id])
  const objetivo = stockObjetivoInsumo(data.propuestas, insumo.id)
  const totalNecesidad = sumar(serie, 'consumo')

  return (
    <Panel title="Consumo previsto y saldo proyectado" description="Cada insumo se grafica en su propia unidad; nunca se mezclan Kg, litros y unidades en un mismo eje.">
      <div className="lg-form-row pl-select-row">
        <Field label="Insumo">
          <select value={insumo.id} onChange={(e) => setInsumoId(Number(e.target.value))}>
            {data.insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({unidadCorta(i.unidad)})</option>)}
          </select>
        </Field>
        <div className="pl-facts">
          <span>Unidad: <strong>{insumo.unidad}</strong></span>
          <span>Necesidad 14 días: <strong>{fmtNum(totalNecesidad, 3)} {unidad}</strong></span>
          <span>Stock objetivo (reposiciones programadas): <strong>{objetivo == null ? 'No disponible en los datos' : `${fmtNum(objetivo, 3)} ${unidad}`}</strong></span>
        </div>
      </div>
      <ChartBox label={`Consumo previsto y saldo final proyectado de ${insumo.nombre}`}>
        <ComposedChart data={serie} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="fecha" tickFormatter={fmtFechaCorta} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={52} label={{ value: unidad, angle: -90, position: 'insideLeft', fontSize: 12 }} />
          <Tooltip content={<TooltipSaldo unidad={unidad} />} />
          <Legend />
          <Bar dataKey="consumo" name={`Consumo previsto (${unidad})`} fill={NAVY} barSize={18} radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="saldoFinal" name={`Saldo final proyectado (${unidad})`} stroke={ORANGE} strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      </ChartBox>
      <p className="pl-footnote">El saldo proyectado incluye recepciones hipotéticas de la propuesta; no es el stock real.</p>

      <div className="lg-table-wrap">
        <table className="lg-table" aria-label={`Necesidades diarias de ${insumo.nombre}`}>
          <thead><tr><th scope="col">Fecha</th><th scope="col" className="num">Necesidad ({unidad})</th><th scope="col" className="num">Saldo inicial</th><th scope="col" className="num">Recepción hipotética</th><th scope="col" className="num">Saldo final</th></tr></thead>
          <tbody>
            {serie.map((r) => (
              <tr key={r.fecha}>
                <td>{diaSemana(r.fecha)} {fmtFecha(r.fecha)}</td>
                <td className="num">{fmtNum(r.consumo, 3)}</td>
                <td className="num">{fmtNum(r.saldoInicial, 3)}</td>
                <td className="num">{r.recepcion > 0 ? fmtNum(r.recepcion, 3) : '—'}</td>
                <td className="num">{fmtNum(r.saldoFinal, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function DetalleLinea({ r }) {
  const u = unidadCorta(r.unidad)
  const bruto = compraSinRedondeo(r)
  const decimales = u === 'Und' || r.unidad.startsWith('Botella') ? 0 : 3
  return (
    <dl className="pl-detail">
      <div><dt>Saldo antes</dt><dd>{fmtNum(r.saldoAntes, 3)} {u}</dd></div>
      <div><dt>Necesidad de cobertura</dt><dd>{fmtNum(r.necesidadCobertura, 3)} {u} (hasta {fmtFecha(r.coberturaHasta)})</dd></div>
      <div><dt>Stock objetivo</dt><dd>{fmtNum(r.stockObjetivo, 3)} {u}</dd></div>
      <div><dt>Política</dt><dd>{r.politica}</dd></div>
      <div className="wide">
        <dt>Cálculo</dt>
        <dd>
          {r.tipo === 'Urgente propuesta'
            ? 'Reposición extraordinaria: cubre el consumo previsto hasta la siguiente reposición programada, sin stock objetivo. '
            : 'Compra = máx(0, necesidad de cobertura + stock objetivo − saldo antes). '}
          {fmtNum(r.necesidadCobertura, 3)} + {fmtNum(r.stockObjetivo, 3)} − {fmtNum(r.saldoAntes, 3)} = {fmtNum(bruto, 3)} {u}, redondeado a {fmtNum(r.cantidad, decimales)} {u}.
          {r.coberturaTruncada ? ' La cobertura natural supera el fin del horizonte: el cálculo se limita a los días disponibles.' : ''}
        </dd>
      </div>
    </dl>
  )
}

function Propuesta({ data }) {
  const [filtros, setFiltros] = useState({ proveedor: '', insumo: '', tipo: '' })
  const [abierta, setAbierta] = useState(null)
  const proveedores = useMemo(() => {
    const m = new Map(data.propuestas.map((r) => [r.proveedorId, r.proveedor || `Proveedor ${r.proveedorId}`]))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [data.propuestas])
  const filas = useMemo(() => filtrarPropuestas(data.propuestas, filtros), [data.propuestas, filtros])
  const porProveedor = useMemo(() => importePorProveedor(filas), [filas])
  const cambiar = (campo) => (e) => { setFiltros((f) => ({ ...f, [campo]: e.target.value })); setAbierta(null) }
  const insumoUnico = filtros.insumo ? data.insumos.find((i) => String(i.id) === filtros.insumo) : null

  const exportar = () => {
    const sufijo = [filtros.proveedor && `prov${filtros.proveedor}`, filtros.insumo && `ins${filtros.insumo}`, filtros.tipo && (filtros.tipo === 'Programada' ? 'programadas' : 'urgentes')].filter(Boolean).join('_')
    descargarCsv(`propuesta_abastecimiento${sufijo ? `_${sufijo}` : ''}.csv`, propuestasACsv(filas))
  }

  return (
    <>
      <Panel title="Propuesta de abastecimiento" description="Líneas propuestas para revisión. Las recepciones son hipotéticas y los importes, referenciales.">
        <div className="lg-form-row">
          <Field label="Proveedor propuesto">
            <select value={filtros.proveedor} onChange={cambiar('proveedor')}>
              <option value="">Todos</option>
              {proveedores.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
          </Field>
          <Field label="Insumo">
            <select value={filtros.insumo} onChange={cambiar('insumo')}>
              <option value="">Todos</option>
              {data.insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select value={filtros.tipo} onChange={cambiar('tipo')}>
              <option value="">Programadas y urgentes</option>
              <option value="Programada">Programadas</option>
              <option value="Urgente propuesta">Urgentes</option>
            </select>
          </Field>
        </div>
        <div className="pl-totals">
          <span><strong>{filas.length}</strong> líneas</span>
          <span>Importe estimado: <strong>{fmtSoles(sumar(filas, 'importe'))}</strong></span>
          {insumoUnico ? <span>Cantidad total: <strong>{fmtNum(sumar(filas, 'cantidad'), 3)} {unidadCorta(insumoUnico.unidad)}</strong></span> : null}
          <button type="button" className="lg-btn lg-btn-ghost" onClick={exportar} disabled={filas.length === 0}>Exportar CSV ({filas.length})</button>
        </div>
        <div className="lg-table-wrap">
          <table className="lg-table" aria-label="Propuesta de abastecimiento">
            <thead><tr><th scope="col" aria-label="Detalle" /><th scope="col">Fecha</th><th scope="col">Insumo</th><th scope="col">Unidad</th><th scope="col" className="num">Cantidad</th><th scope="col">Proveedor propuesto</th><th scope="col">Tipo</th><th scope="col" className="num">Importe estimado</th></tr></thead>
            <tbody>
              {filas.length === 0 ? <tr><td className="lg-table-empty" colSpan={8}>Ninguna línea coincide con los filtros.</td></tr> : null}
              {filas.flatMap((r) => {
                const clave = `${r.fecha}-${r.insumoId}-${r.tipo}`
                const abierto = abierta === clave
                return [
                  <tr key={clave}>
                    <td><button type="button" className="pl-toggle" aria-expanded={abierto} aria-label={`Detalle de ${r.insumo} del ${fmtFecha(r.fecha)}`} onClick={() => setAbierta(abierto ? null : clave)}>{abierto ? '−' : '+'}</button></td>
                    <td>{diaSemana(r.fecha)} {fmtFecha(r.fecha)}</td>
                    <td>{r.insumo}</td>
                    <td>{unidadCorta(r.unidad)}</td>
                    <td className="num">{fmtNum(r.cantidad, 3)}</td>
                    <td>{r.proveedor || 'Sin proveedor'}</td>
                    <td>
                      <span className={`pl-badge ${r.tipo === 'Urgente propuesta' ? 'is-warn' : 'is-ok'}`}>{r.tipo}</span>
                      {r.coberturaTruncada ? <span className="pl-badge is-trunc" title="La cobertura natural termina después del horizonte; se cubre solo hasta su último día">Cobertura truncada</span> : null}
                    </td>
                    <td className="num">{fmtSoles(r.importe)}</td>
                  </tr>,
                  abierto ? <tr key={`${clave}-d`} className="pl-detail-row"><td colSpan={8}><DetalleLinea r={r} /></td></tr> : null,
                ]
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Importe estimado por proveedor" description="Según las líneas filtradas. Referencial: no son cotizaciones ni incluyen condiciones del proveedor.">
        {porProveedor.length === 0 ? <p className="lg-empty">Sin líneas para graficar.</p> : (
          <div className="pl-chart pl-chart-bars" style={{ height: 70 + porProveedor.length * 56 }} role="img" aria-label="Importe estimado por proveedor">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porProveedor} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `S/ ${fmtNum(v, 0)}`} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="proveedor" width={170} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [fmtSoles(v), 'Importe estimado']} />
                <Legend />
                <Bar dataKey="importe" name="Importe estimado (S/)" fill={ORANGE} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </>
  )
}

function Calidad({ data }) {
  const prueba = data.metricas.prueba
  const filas = [['XGBoost', prueba.xgboost], ['Referencia (promedio de 4 mismos días de la semana)', prueba.referencia]]
  return (
    <details className="lg-panel pl-details">
      <summary>Calidad y contexto del cálculo</summary>
      <h3>Error en la prueba final (01/10–28/10/2026)</h3>
      <div className="lg-table-wrap">
        <table className="lg-table" aria-label="Métricas de prueba">
          <thead><tr><th scope="col">Método</th><th scope="col" className="num">MAE (unidades/día)</th><th scope="col" className="num">WAPE (% de error)</th><th scope="col" className="num">MAE solo días disponibles</th></tr></thead>
          <tbody>
            {filas.map(([nombre, m]) => (
              <tr key={nombre}><td>{nombre}</td><td className="num">{fmtNum(m.global.mae, 2)}</td><td className="num">{fmtPct(m.global.wape)}</td><td className="num">{fmtNum(m.diasDisponibles.mae, 2)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pl-footnote">WAPE es el error absoluto total sobre las ventas observadas (menor es mejor). Los datos son sintéticos: la evaluación demuestra el método bajo la simulación, no precisión sobre demanda real.</p>
      <h3>Supuestos y limitaciones</h3>
      <ul>
        <li><strong>Stock de apertura:</strong> fotografía del cierre del {fmtFecha(data.meta.fechaCorte)} ({data.meta.fuenteStockInicial}).</li>
        {data.meta.supuestos.map((s) => <li key={s}>{s}</li>)}
      </ul>
    </details>
  )
}

function PanelPlanificacion({ data, onRefresh, refreshing }) {
  const [tab, setTab] = useState('demanda')
  const ind = useMemo(() => indicadores(data), [data])
  return (
    <>
      <Cabecera meta={data.meta} onRefresh={onRefresh} refreshing={refreshing} />
      <Notice>Propuesta para revisión. No registra compras ni modifica existencias.</Notice>
      <Indicadores ind={ind} />
      <Tabs label="Secciones de planificación" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'demanda' ? <Demanda data={data} /> : null}
      {tab === 'necesidades' ? <Necesidades data={data} /> : null}
      {tab === 'propuesta' ? <Propuesta data={data} /> : null}
      <Calidad data={data} />
    </>
  )
}

function Planificacion() {
  const [estado, setEstado] = useState({ status: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_URL}/logistica/planificacion`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (res.status === 503) return { status: 'vacio', message: body?.error }
        if (!res.ok) return { status: 'error', message: body?.error || `El servidor respondió ${res.status}.` }
        if (!esPanelValido(body)) return { status: 'error', message: 'Los resultados recibidos no tienen el formato esperado.' }
        return { status: 'ok', data: body }
      })
      .then(setEstado)
      .catch((err) => {
        if (err.name !== 'AbortError') setEstado({ status: 'error', message: 'No se pudo conectar con el servidor. Verifique que el backend esté en ejecución.' })
      })
    return () => controller.abort()
  }, [intento])

  const recargar = () => {
    setEstado((e) => (e.status === 'ok' ? { ...e, refreshing: true } : { status: 'cargando' }))
    setIntento((n) => n + 1)
  }

  if (estado.status === 'cargando') return <p className="lg-empty" role="status">Cargando resultados guardados…</p>
  if (estado.status === 'vacio') {
    return (
      <div className="lg-empty pl-state" role="status">
        <strong>Todavía no hay resultados de planificación.</strong>
        <p>{estado.message}</p>
        <button type="button" className="lg-btn" onClick={recargar}>Actualizar resultados</button>
      </div>
    )
  }
  if (estado.status === 'error') {
    return (
      <div className="lg-empty pl-state is-error" role="alert">
        <strong>No se pudieron cargar los resultados.</strong>
        <p>{estado.message}</p>
        <button type="button" className="lg-btn" onClick={recargar}>Reintentar</button>
      </div>
    )
  }
  return <PanelPlanificacion data={estado.data} onRefresh={recargar} refreshing={Boolean(estado.refreshing)} />
}

export default Planificacion
