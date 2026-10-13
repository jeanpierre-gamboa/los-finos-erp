import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/AuthContext.jsx'
import { useComercial } from '../modules/comercial/ComercialContext.jsx'

const TITLES = {
  '/comercial': 'Comercial',
  '/comercial/pedido': 'Nuevo pedido',
  '/comercial/cola': 'Cola de pedidos',
  '/comercial/cocina': 'Pedidos en cocina',
  '/comercial/cobro': 'Cobro',
  '/comercial/periodo': 'Cierre de período',
  '/comercial/nota-credito': 'Nota de crédito',
}

const CHANNELS = [{ id: 'salon', label: 'Salón' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'llamafood', label: 'Llamafood' }]
const INCIDENT_OPTIONS = [{ value: 'retraso', label: 'Retraso' }, { value: 'falta-de-producto', label: 'Falta de producto' }, { value: 'otro', label: 'Otro' }]
const PAYMENT_OPTIONS = ['Efectivo', 'Tarjeta', 'Yape / Plin', 'Transferencia']
const CPE_OPTIONS = ['Aceptado', 'Rechazado', 'Contingencia']
const COMMERCIAL_MENU = [
  { path: '/comercial/pedido', label: 'Nuevo pedido', description: 'Registra una venta desde el catálogo.' },
  { path: '/comercial/cola', label: 'Cola', description: 'Consulta y gestiona pedidos activos.' },
  { path: '/comercial/cocina', label: 'Comanda', description: 'Envía pedidos y controla preparación.' },
  { path: '/comercial/cobro', label: 'Cobro', description: 'Emite boletas y facturas.' },
  { path: '/comercial/nota-credito', label: 'Nota de crédito', description: 'Corrige comprobantes emitidos.' },
  { path: '/comercial/periodo', label: 'Ventas del período', description: 'Revisa ventas y estado CPE.' },
]

function formatCurrency(value) { return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value) }
function formatTime(value) { return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function isEditable(pedido) { return Date.now() - new Date(pedido.creadoEn).getTime() < 5 * 60 * 1000 }
function StatusBadge({ status }) { return <span className={`status-badge status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span> }

function Header({ user, role, onBack }) {
  return <header className="module-header compras-header"><div className="brand-group"><div className="brand-mark">LF</div><div><span>Los Finos</span><p className="header-module-name">Comercial</p></div></div><div className="header-actions"><button type="button" className="ghost-button" onClick={onBack}>Volver a apps</button><div className="user-meta"><span>{user}</span><small>{role}</small></div></div></header>
}

function BackToCommercial() {
  return <Link className="back-link commercial-back-link" to="/comercial">← Volver</Link>
}

function NewOrder({ editingOrder, onSave, onCancel }) {
  const { productos, preciosPorCanal } = useComercial()
  const [canal, setCanal] = useState(editingOrder?.canal || 'salon')
  const [mesa, setMesa] = useState(editingOrder?.mesa || '')
  const [productoId, setProductoId] = useState(editingOrder?.lineas[0]?.productoId || '')
  const [cantidad, setCantidad] = useState(editingOrder?.lineas[0]?.cantidad || 1)
  const [error, setError] = useState('')
  const producto = productos.find((item) => item.id === productoId)
  const precio = productoId ? preciosPorCanal[canal][productoId] : 0
  const total = Number(cantidad || 0) * precio
  const handleSubmit = (event) => {
    event.preventDefault()
    if (!productoId || Number(cantidad) <= 0 || (canal === 'salon' && !mesa.trim())) { setError('Completa canal, mesa si corresponde, producto y una cantidad mayor a cero.'); return }
    onSave({ canal, mesa: mesa.trim(), lineas: [{ productoId, productoNombre: producto.nombre, cantidad: Number(cantidad), precioUnitario: precio }] })
  }
  return <><BackToCommercial /><div className="page-heading compact-heading"><div><p className="eyebrow">Comercial / Pedido</p><h1>{editingOrder ? `Editar ${editingOrder.numero}` : 'Nuevo pedido'}</h1><p className="page-subtitle">El precio se toma automáticamente del catálogo del canal seleccionado.</p></div></div><form className="order-form" onSubmit={handleSubmit}><div className="form-grid"><label className="input-row"><span>Canal</span><select value={canal} onChange={(event) => { const nextCanal = event.target.value; setCanal(nextCanal); if (nextCanal !== 'salon') setMesa('') }}>{CHANNELS.map((channel) => <option key={channel.id} value={channel.id}>{channel.label}</option>)}</select></label>{canal === 'salon' ? <label className="input-row"><span>Mesa</span><input required value={mesa} onChange={(event) => setMesa(event.target.value)} placeholder="Ej. 12" /></label> : <div />}</div><div className="lines-heading"><div><h2>Detalle del pedido</h2><p>Selecciona un producto del catálogo y su cantidad.</p></div></div><div className="line-row commercial-line"><label className="input-row"><span>Producto</span><select required value={productoId} onChange={(event) => setProductoId(event.target.value)}><option value="">Selecciona un producto</option>{productos.map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.categoria}</option>)}</select></label><label className="input-row"><span>Cantidad</span><input required min="1" step="1" type="number" value={cantidad} onChange={(event) => setCantidad(event.target.value)} /></label><label className="input-row"><span>Precio unitario</span><input value={productoId ? formatCurrency(precio) : '-'} disabled readOnly /></label><span className="line-subtotal">{formatCurrency(total)}</span></div>{error ? <div className="error-message">{error}</div> : null}<div className="order-total"><span>Total</span><strong>{formatCurrency(total)}</strong></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-button">{editingOrder ? 'Guardar cambios' : 'Confirmar pedido'}</button></div></form></>
}

function IncidentForm({ pedido, onSave }) {
  const [tipo, setTipo] = useState('retraso')
  const [detalle, setDetalle] = useState('')
  return <form className="incident-form" onSubmit={(event) => { event.preventDefault(); onSave(pedido.id, { tipo, detalle }) }}><label className="input-row"><span>Tipo de incidencia</span><select value={tipo} onChange={(event) => setTipo(event.target.value)}>{INCIDENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="input-row"><span>Detalle</span><textarea required value={detalle} onChange={(event) => setDetalle(event.target.value)} placeholder="Describe la incidencia" rows="3" /></label><button type="submit" className="secondary-button">Registrar incidencia</button></form>
}

function QueueCard({ pedido, onEdit, onCancel, onIncident }) {
  const editable = isEditable(pedido)
  return <article className="queue-card"><div className="queue-card-heading"><div><strong>{pedido.numero}</strong><span>{formatTime(pedido.creadoEn)} · {pedido.mesa ? `Mesa ${pedido.mesa}` : 'Sin mesa'}</span></div><StatusBadge status={pedido.estado} /></div><p>{pedido.lineas.map((linea) => `${linea.cantidad} × ${linea.productoNombre}`).join(', ')}</p><div className="queue-card-footer"><strong>{formatCurrency(pedido.total)}</strong>{pedido.estado === 'Confirmado' && editable ? <div><button type="button" className="authorize-button" onClick={() => onEdit(pedido)}>Editar</button><button type="button" className="cancel-button" onClick={() => onCancel(pedido.id)}>Anular</button></div> : null}</div>{pedido.estado === 'Confirmado' && !editable ? <IncidentForm pedido={pedido} onSave={onIncident} /> : null}{pedido.incidencia ? <p className="incident-note">Incidencia: {pedido.incidencia.tipo} {pedido.incidencia.detalle ? `· ${pedido.incidencia.detalle}` : ''}</p> : null}</article>
}

function Queue({ onEdit }) {
  const { pedidos, anularPedido, registrarIncidencia } = useComercial()
  return <><BackToCommercial /><div className="page-heading"><div><p className="eyebrow">Comercial / Operación</p><h1>Cola de pedidos</h1><p className="page-subtitle">Los pedidos se pueden editar o anular durante los primeros cinco minutos.</p></div></div><div className="queue-grid">{CHANNELS.map((channel) => { const channelOrders = pedidos.filter((pedido) => pedido.canal === channel.id); return <section className="queue-column" key={channel.id}><div className="queue-column-heading"><h2>{channel.label}</h2><span>{channelOrders.length}</span></div>{channelOrders.length ? channelOrders.map((pedido) => <QueueCard key={pedido.id} pedido={pedido} onEdit={onEdit} onCancel={anularPedido} onIncident={registrarIncidencia} />) : <p className="empty-state">Sin pedidos pendientes</p>}</section> })}</div></>
}

function Kitchen() {
  const { cocina, pedidos, cambiarEstadoCocina, atenderPedido } = useComercial()
  const active = cocina.filter((item) => item.estado !== 'Atendido')
  return <><BackToCommercial /><div className="page-heading"><div><p className="eyebrow">Comercial / Producción</p><h1>Pedidos en cocina</h1><p className="page-subtitle">Cada pedido confirmado genera su orden COM correspondiente.</p></div></div><div className="kitchen-list">{active.length ? active.map((item) => { const pedido = pedidos.find((candidate) => candidate.id === item.pedidoId); return <article className="kitchen-card" key={item.id}><div className="queue-card-heading"><div><strong>{item.numero}</strong><span>{pedido?.numero} · {formatTime(item.creadoEn)}</span></div><StatusBadge status={item.estado} /></div><p>{item.lineas.map((linea) => `${linea.cantidad} × ${linea.productoNombre}`).join(', ')}</p><div className="kitchen-actions">{item.estado === 'Pendiente' ? <button type="button" className="primary-button" onClick={() => cambiarEstadoCocina(item.id, 'En preparación')}>Iniciar preparación</button> : <button type="button" className="primary-button" onClick={() => atenderPedido(item.id)}>Marcar Atendido</button>}</div></article> }) : <p className="empty-state">No hay pedidos pendientes en cocina.</p>}</div>{cocina.filter((item) => item.estado === 'Atendido').map((item) => <section className="recipe-release" key={item.id}><div className="queue-card-heading"><div><h2>{item.numero} atendido</h2><span>Baja de receta</span></div><StatusBadge status="Atendido" /></div><div className="table-scroll"><table><thead><tr><th>Insumo</th><th>Cantidad</th><th>Unidad</th></tr></thead><tbody>{item.bajaReceta.map((linea, index) => <tr key={`${linea.insumo}-${index}`}><td>{linea.insumo}</td><td>{linea.cantidad}</td><td>{linea.unidad}</td></tr>)}</tbody></table></div></section>)}</>
}

function Payment({ pedido, onEmit }) {
  const [medioPago, setMedioPago] = useState(PAYMENT_OPTIONS[0])
  const [tipo, setTipo] = useState('Boleta')
  const [ruc, setRuc] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [direccion, setDireccion] = useState('')
  const [error, setError] = useState('')
  const submit = (event) => { event.preventDefault(); if (tipo === 'Factura' && (!ruc.trim() || !razonSocial.trim() || !direccion.trim())) { setError('Para factura se requieren RUC, razón social y dirección.'); return } onEmit(pedido.id, { medioPago, tipo, ruc, razonSocial, direccion }) }
  return <form className="order-form payment-form" onSubmit={submit}><div className="detail-heading"><div><span className="detail-label">Pedido</span><strong>{pedido.numero}</strong></div><div><span className="detail-label">Total</span><strong>{formatCurrency(pedido.total)}</strong></div></div><div className="form-grid"><label className="input-row"><span>Medio de pago</span><select value={medioPago} onChange={(event) => setMedioPago(event.target.value)}>{PAYMENT_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label><label className="input-row"><span>Comprobante</span><select value={tipo} onChange={(event) => setTipo(event.target.value)}><option>Boleta</option><option>Factura</option></select></label></div>{tipo === 'Factura' ? <div className="form-grid"><label className="input-row"><span>RUC</span><input required value={ruc} onChange={(event) => setRuc(event.target.value)} /></label><label className="input-row"><span>Razón social</span><input required value={razonSocial} onChange={(event) => setRazonSocial(event.target.value)} /></label><label className="input-row"><span>Dirección</span><input required value={direccion} onChange={(event) => setDireccion(event.target.value)} /></label></div> : null}<div className="totals-box"><span>Base <strong>{formatCurrency(pedido.subtotal)}</strong></span><span>IGV <strong>{formatCurrency(pedido.igv)}</strong></span><span>Total <strong>{formatCurrency(pedido.total)}</strong></span></div>{error ? <div className="error-message">{error}</div> : null}<div className="form-actions"><button type="submit" className="primary-button">Emitir {tipo}</button></div></form>
}

function SunatActions({ comprobante, onChange }) {
  if (!['Pendiente', 'Contingencia'].includes(comprobante.estadoCpe)) return null
  return <div className="receipt-actions">{CPE_OPTIONS.map((estado) => <button type="button" className="secondary-button" key={estado} onClick={() => onChange(comprobante.id, estado)}>Simular SUNAT: {estado}</button>)}</div>
}

function Cobro() {
  const navigate = useNavigate()
  const { pedidos, comprobantes, emitirComprobante, simularSunat } = useComercial()
  const atendidos = pedidos.filter((pedido) => pedido.estado === 'Atendido')
  const emit = (pedidoId, datos) => emitirComprobante(pedidoId, datos)
  return <><BackToCommercial /><div className="page-heading"><div><p className="eyebrow">Comercial / Caja</p><h1>Cobro</h1><p className="page-subtitle">Solo aparecen pedidos que cocina marcó como Atendido.</p></div></div>{atendidos.length ? <div className="cobro-grid">{atendidos.map((pedido) => <div key={pedido.id}><h2 className="section-title">{pedido.numero}</h2><Payment pedido={pedido} onEmit={emit} /></div>)}</div> : <p className="empty-state">No hay pedidos Atendido pendientes de cobro.</p>}{comprobantes.length ? <section className="orders-panel recent-receipts"><div className="table-toolbar"><span>Comprobantes emitidos</span><button type="button" className="back-link" onClick={() => navigate('/comercial/periodo')}>Ver período</button></div><div className="table-scroll"><table><thead><tr><th>Comprobante</th><th>Tipo</th><th>Estado CPE</th><th>Acciones</th></tr></thead><tbody>{comprobantes.slice(-5).map((comprobante) => <tr key={comprobante.id}><td>{comprobante.numero}</td><td>{comprobante.tipo}</td><td><StatusBadge status={comprobante.estadoCpe} /></td><td><SunatActions comprobante={comprobante} onChange={simularSunat} /></td></tr>)}</tbody></table></div></section> : null}</>
}

function Period() {
  const navigate = useNavigate()
  const { comprobantes } = useComercial()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const filtered = comprobantes.filter((item) => (!desde || item.fecha.slice(0, 10) >= desde) && (!hasta || item.fecha.slice(0, 10) <= hasta))
  const totals = filtered.reduce((sum, item) => {
    const total = Number(item.total) || 0
    const base = Number(item.base) || (total / 1.18)
    const igv = Number(item.igv) || (total - base)
    return { base: sum.base + base, igv: sum.igv + igv, total: sum.total + total }
  }, { base: 0, igv: 0, total: 0 })
  return <><BackToCommercial /><div className="page-heading"><div><p className="eyebrow">Comercial / Fiscal</p><h1>Cierre de período</h1><p className="page-subtitle">Reporte listo para SIRE/RVIE.</p></div></div><section className="orders-panel period-panel"><div className="period-filters"><label className="input-row"><span>Desde</span><input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} /></label><label className="input-row"><span>Hasta</span><input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} /></label></div><div className="table-scroll"><table><thead><tr><th>Tipo</th><th>Serie</th><th>Número</th><th>Base</th><th>IGV</th><th>Total</th><th>Estado CPE</th><th /></tr></thead><tbody>{filtered.map((item) => { const total = Number(item.total) || 0; const base = Number(item.base) || (total / 1.18); const igv = Number(item.igv) || (total - base); return <tr key={item.id}><td>{item.tipo}</td><td>{item.serie}</td><td className="order-number">{item.numero}</td><td>{formatCurrency(base)}</td><td>{formatCurrency(igv)}</td><td>{formatCurrency(total)}</td><td><StatusBadge status={item.estadoCpe} /></td><td><button type="button" className="order-link" onClick={() => navigate(`/comercial/nota-credito?comprobante=${item.id}`)}>Nota de crédito</button></td></tr> })}</tbody><tfoot><tr><th colSpan="3">Totales ({filtered.length})</th><th>{formatCurrency(totals.base)}</th><th>{formatCurrency(totals.igv)}</th><th>{formatCurrency(totals.total)}</th><th colSpan="2" /></tr></tfoot></table></div></section></>
}

function CreditNote() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { comprobantes, notasCredito, crearNotaCredito } = useComercial()
  const comprobante = comprobantes.find((item) => item.id === searchParams.get('comprobante'))
  const [motivo, setMotivo] = useState('')
  const [creada, setCreada] = useState(null)
  const [comprobanteId, setComprobanteId] = useState(searchParams.get('comprobante') || '')
  if (!comprobante) return <><BackToCommercial /><form className="order-form credit-picker" onSubmit={(event) => { event.preventDefault(); if (comprobanteId) navigate(`/comercial/nota-credito?comprobante=${comprobanteId}`) }}><div><p className="eyebrow">Nota de crédito</p><h1>Seleccionar comprobante emitido</h1><p className="page-subtitle">También puedes abrir esta pantalla desde Ventas del período.</p></div><label className="input-row"><span>Comprobante original</span><select required value={comprobanteId} onChange={(event) => setComprobanteId(event.target.value)}><option value="">Selecciona un comprobante</option>{comprobantes.map((item) => <option key={item.id} value={item.id}>{item.numero} · {item.tipo}</option>)}</select></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => navigate('/comercial/periodo')}>Ir a período</button><button type="submit" className="primary-button">Continuar</button></div></form></>
  const submit = (event) => { event.preventDefault(); if (!motivo.trim()) return; crearNotaCredito(comprobante.id, motivo.trim()); setCreada({ numeroOriginal: comprobante.numero, motivo: motivo.trim() }) }
  return <><BackToCommercial /><div className="page-heading"><div><p className="eyebrow">Comercial / Documento relacionado</p><h1>Nota de crédito</h1><p className="page-subtitle">Se genera desde un comprobante ya emitido; no forma parte del flujo de cobro.</p></div></div>{creada ? <section className="orders-panel confirmation-panel"><p className="eyebrow">NC registrada</p><h2>Referencia {creada.numeroOriginal}</h2><p>{creada.motivo}</p><StatusBadge status="NC" /><button type="button" className="secondary-button" onClick={() => navigate('/comercial/periodo')}>Volver a período</button></section> : <form className="order-form" onSubmit={submit}><div className="detail-heading"><div><span className="detail-label">Comprobante original</span><strong>{comprobante.numero}</strong></div><div><span className="detail-label">Serie original</span><strong>{comprobante.serie}</strong></div><div><span className="detail-label">Total</span><strong>{formatCurrency(comprobante.total)}</strong></div></div><label className="input-row"><span>Motivo de la nota</span><textarea required rows="4" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Describe el motivo" /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => navigate('/comercial')}>Cancelar</button><button type="submit" className="primary-button">Emitir NC</button></div></form>}{notasCredito.length ? <p className="page-subtitle">Notas registradas: {notasCredito.length}</p> : null}</>
}

function CommercialMenu() {
  return <><div className="page-heading"><div><p className="eyebrow">Módulo Comercial</p><h1>Operación comercial</h1><p className="page-subtitle">Selecciona un flujo para continuar.</p></div></div><nav className="commercial-menu" aria-label="Menú Comercial">{COMMERCIAL_MENU.map((item) => <Link className="commercial-menu-link" to={item.path} key={item.path}><strong>{item.label}</strong><span>{item.description}</span></Link>)}</nav></>
}

function Comercial() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const { user, role } = useAuth()
  const { pedidos, crearPedido, actualizarPedido } = useComercial()
  const editingOrder = pedidos.find((pedido) => pedido.id === searchParams.get('pedido'))
  if (!user) return <Navigate to="/login" replace />
  const saveOrder = (order) => { if (editingOrder && !isEditable(editingOrder)) { navigate('/comercial/cola'); return } if (editingOrder) actualizarPedido(editingOrder.id, order); else crearPedido(order); navigate('/comercial/cola') }
  const content = pathname === '/comercial' ? <CommercialMenu /> : pathname === '/comercial/pedido' ? <NewOrder editingOrder={editingOrder} onSave={saveOrder} onCancel={() => navigate('/comercial')} /> : pathname === '/comercial/cola' ? <Queue onEdit={(pedido) => navigate(`/comercial/pedido?pedido=${pedido.id}`)} /> : pathname === '/comercial/cocina' ? <Kitchen /> : pathname === '/comercial/cobro' ? <Cobro /> : pathname === '/comercial/periodo' ? <Period /> : pathname === '/comercial/nota-credito' ? <CreditNote /> : <div className="module-panel"><p className="module-kicker">{TITLES[pathname] || 'Comercial'}</p></div>
  return <div className="module-page"><Header user={user} role={role} onBack={() => navigate('/apps')} /><main className="module-main compras-main">{content}</main></div>
}

export default Comercial