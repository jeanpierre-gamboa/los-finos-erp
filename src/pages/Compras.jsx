import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../app/AuthContext.jsx'
import { useCompras } from '../modules/compras/ComprasContext.jsx'

const TIPO_OPTIONS = ['Diario · pollo', '3x semana · carnes', 'Quincenal · secos']
const createLine = () => ({ id: crypto.randomUUID(), insumoId: '', cantidad: '', unidad: '', precioUnitario: '' })

function formatCurrency(value) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value)
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
}

function ComprasHeader({ user, role, onBack }) {
  return <header className="module-header compras-header"><div className="brand-group"><div className="brand-mark">LF</div><div><span>Los Finos</span><p className="header-module-name">Compras</p></div></div><div className="header-actions"><button type="button" className="ghost-button" onClick={onBack}>Volver a apps</button><div className="user-meta"><span>{user}</span><small>{role}</small></div></div></header>
}

function OrderDetail({ order, onBack }) {
  return <><div className="page-heading compact-heading"><div><button type="button" className="back-link inline-back" onClick={onBack}>← Volver a órdenes</button><p className="eyebrow">Detalle de orden</p><h1>{order.numero}</h1><p className="page-subtitle">{order.proveedorNombre} · {order.fecha}</p></div><StatusBadge status={order.estado} /></div><section className="orders-panel detail-panel" aria-label={`Detalle de ${order.numero}`}><div className="detail-heading"><div><span className="detail-label">Proveedor</span><strong>{order.proveedorNombre}</strong></div><div><span className="detail-label">Calendario</span><strong>{order.tipoCalendario}</strong></div></div><div className="table-scroll"><table><thead><tr><th>Insumo</th><th>Cantidad</th><th>Unidad</th><th className="number-cell">Precio unitario</th><th className="number-cell">Subtotal</th></tr></thead><tbody>{order.lineas.map((linea) => <tr key={linea.id}><td className="order-number">{linea.insumoNombre}</td><td>{linea.cantidad}</td><td>{linea.unidad}</td><td className="number-cell">{formatCurrency(linea.precioUnitario)}</td><td className="number-cell">{formatCurrency(linea.cantidad * linea.precioUnitario)}</td></tr>)}</tbody></table></div><div className="detail-total"><span>Total de la orden</span><strong>{formatCurrency(order.total)}</strong></div></section></>
}

function OrdersList({ orders, onAuthorize, onReceive, onNew, onDetail, onBack }) {
  return <><div className="page-heading"><div><p className="eyebrow">Abastecimiento</p><h1>Órdenes de compra</h1><p className="page-subtitle">Gestiona pedidos recurrentes de cocina y almacén.</p></div><button type="button" className="primary-button" onClick={onNew}>+ Nueva orden</button></div><section className="orders-panel" aria-label="Lista de órdenes de compra"><div className="table-toolbar"><span>{orders.length} órdenes registradas</span><span className="toolbar-note">La recepción se completa desde Almacenes</span></div><div className="table-scroll"><table><thead><tr><th>Número</th><th>Proveedor</th><th>Tipo calendario</th><th>Estado</th><th className="number-cell">Total</th><th aria-label="Acciones" /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><button type="button" className="order-link" onClick={() => onDetail(order.id)}>{order.numero}</button></td><td>{order.proveedorNombre}</td><td>{order.tipoCalendario}</td><td><StatusBadge status={order.estado} /></td><td className="number-cell">{formatCurrency(order.total)}</td><td className="actions-cell">{order.estado === 'Borrador' ? <button type="button" className="authorize-button" onClick={() => onAuthorize(order.id)}>Autorizar</button> : null}{order.estado === 'Autorizada' ? <button type="button" className="authorize-button" onClick={() => onReceive(order.id)}>Marcar por recibir</button> : null}</td></tr>)}</tbody></table></div></section><button type="button" className="back-link" onClick={onBack}>← Volver al launcher</button></>
}

function NewOrder({ onSave, onCancel, proveedores, insumos, obtenerUltimoPrecio }) {
  const [providerId, setProviderId] = useState('')
  const [type, setType] = useState(TIPO_OPTIONS[0])
  const [lines, setLines] = useState([createLine()])
  const [error, setError] = useState('')
  const updateLine = (lineId, field, value) => setLines((currentLines) => currentLines.map((line) => line.id === lineId ? { ...line, [field]: value } : line))
  const selectInsumo = (lineId, insumoId) => { const insumo = insumos.find((item) => item.id === insumoId); setLines((currentLines) => currentLines.map((line) => line.id === lineId ? { ...line, insumoId, unidad: insumo?.unidad || '', precioUnitario: insumoId ? obtenerUltimoPrecio(insumoId, providerId) : '' } : line)) }
  const selectProvider = (nextProviderId) => { setProviderId(nextProviderId); setLines((currentLines) => currentLines.map((line) => line.insumoId ? { ...line, precioUnitario: obtenerUltimoPrecio(line.insumoId, nextProviderId) } : line)) }
  const total = lines.reduce((sum, line) => sum + Number(line.cantidad || 0) * Number(line.precioUnitario || 0), 0)
  const handleSubmit = (event) => { event.preventDefault(); const invalid = !providerId || lines.length === 0 || lines.some((line) => !line.insumoId || Number(line.cantidad) <= 0 || Number(line.precioUnitario) <= 0); if (invalid) { setError('Completa proveedor, insumo, cantidades y precios mayores a cero.'); return } onSave({ proveedorId: providerId, tipoCalendario: type, lineas: lines }) }
  return <><div className="page-heading compact-heading"><div><p className="eyebrow">Abastecimiento / Nueva orden</p><h1>Crear orden de compra</h1></div></div><form className="order-form" onSubmit={handleSubmit}><div className="form-grid"><label className="input-row"><span>Proveedor</span><select required value={providerId} onChange={(event) => selectProvider(event.target.value)}><option value="">Selecciona un proveedor</option>{proveedores.map((provider) => <option key={provider.id} value={provider.id}>{provider.nombre} · {provider.rubro}</option>)}</select></label><label className="input-row"><span>Tipo de calendario</span><select value={type} onChange={(event) => setType(event.target.value)}>{TIPO_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label></div><div className="lines-heading"><div><h2>Líneas de pedido</h2><p>El precio corresponde a este proveedor y esta compra.</p></div><button type="button" className="secondary-button" onClick={() => setLines([...lines, createLine()])}>+ Agregar línea</button></div><div className="line-list">{lines.map((line, index) => <div className="line-row purchase-line" key={line.id}><label className="input-row"><span>Insumo</span><select required value={line.insumoId} onChange={(event) => selectInsumo(line.id, event.target.value)}><option value="">Selecciona un insumo</option>{insumos.map((insumo) => <option key={insumo.id} value={insumo.id}>{insumo.nombre}</option>)}</select></label><label className="input-row"><span>Cantidad</span><input required min="0.01" step="0.01" type="number" value={line.cantidad} onChange={(event) => updateLine(line.id, 'cantidad', event.target.value)} placeholder="0" /></label><label className="input-row"><span>Unidad</span><select required value={line.unidad} onChange={(event) => updateLine(line.id, 'unidad', event.target.value)}><option value="">Unidad</option><option>kg</option><option>l</option><option>unidad</option><option>caja</option></select></label><label className="input-row"><span>Precio unitario (S/)</span><input required min="0.01" step="0.01" type="number" value={line.precioUnitario} onChange={(event) => updateLine(line.id, 'precioUnitario', event.target.value)} placeholder="0.00" /></label><span className="line-subtotal">{formatCurrency(Number(line.cantidad || 0) * Number(line.precioUnitario || 0))}</span><button type="button" className="remove-line" aria-label={`Eliminar línea ${index + 1}`} onClick={() => setLines(lines.filter((item) => item.id !== line.id))}>×</button></div>)}</div>{error ? <div className="error-message">{error}</div> : null}<div className="order-total"><span>Total de la orden</span><strong>{formatCurrency(total)}</strong></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-button">Guardar como Borrador</button></div></form></>
}

function Compras({ view = 'list' }) {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const { user, role } = useAuth()
  const { ordenes, proveedores, insumos, crearOrden, autorizarOrden, marcarPorRecibir, obtenerUltimoPrecio } = useCompras()
  if (!user) return <Navigate to="/login" replace />
  if (!['gerente', 'almacen'].includes(role)) return <Navigate to="/apps" replace />
  const selectedOrder = orderId ? ordenes.find((order) => order.id === orderId) : null
  const content = view === 'new' ? <NewOrder proveedores={proveedores} insumos={insumos} obtenerUltimoPrecio={obtenerUltimoPrecio} onSave={(order) => { crearOrden(order); navigate('/app/compras') }} onCancel={() => navigate('/app/compras')} /> : selectedOrder ? <OrderDetail order={selectedOrder} onBack={() => navigate('/app/compras')} /> : <OrdersList orders={ordenes} onAuthorize={autorizarOrden} onReceive={marcarPorRecibir} onNew={() => navigate('/app/compras/nueva')} onDetail={(id) => navigate(`/app/compras/${id}`)} onBack={() => navigate('/apps')} />
  return <div className="module-page compras-page"><ComprasHeader user={user} role={role} onBack={() => navigate('/apps')} /><main className="module-main compras-main">{content}</main></div>
}

export default Compras
