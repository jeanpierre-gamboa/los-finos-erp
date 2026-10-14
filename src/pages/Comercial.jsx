import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthContext.jsx'
import { useComercial } from '../modules/comercial/ComercialContext.jsx'

const newLine = () => ({ id: crypto.randomUUID(), platoId: '', cantidad: 1 })

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
}

function Header({ user, role, onBack, onNavigate, view }) {
  return <><header className="module-header comercial-header"><div className="brand-group"><div className="brand-mark">LF</div><div><span>Los Finos</span><p className="header-module-name">{role === 'cocina' ? 'Cocina' : 'Comercial'}</p></div></div><div className="header-actions"><button type="button" className="ghost-button" onClick={onBack}>Volver a apps</button><div className="user-meta"><span>{user}</span><small>{role}</small></div></div></header>{role !== 'cocina' ? <nav className="section-nav" aria-label="Secciones de Comercial"><button type="button" className={view === 'comercial' ? 'active' : ''} onClick={() => onNavigate('/app/ventas')}>Cola de pedidos</button><button type="button" className={view === 'new' ? 'active' : ''} onClick={() => onNavigate('/app/ventas/nuevo')}>Nuevo pedido</button>{role === 'gerente' ? <button type="button" onClick={() => onNavigate('/app/cocina')}>Cocina</button> : null}</nav> : null}</>
}

function OrderForm({ platos, mesas, initialOrder, onSave, onCancel }) {
  const [channel, setChannel] = useState(initialOrder?.canal || 'Salón')
  const [table, setTable] = useState(initialOrder?.mesa || '')
  const [lines, setLines] = useState(initialOrder?.lineas.map((line) => ({ id: line.id, platoId: line.platoId, cantidad: line.cantidad })) || [newLine()])
  const [error, setError] = useState('')
  const updateLine = (id, field, value) => setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: value } : line))
  const selectedDish = (id) => platos.find((plato) => plato.id === id)
  const total = lines.reduce((sum, line) => sum + Number(line.cantidad || 0) * Number(selectedDish(line.platoId)?.precios[channel] || 0), 0)
  const submit = (event) => {
    event.preventDefault()
    if ((channel === 'Salón' && !table) || lines.some((line) => !line.platoId || Number(line.cantidad) < 1)) {
      setError('Selecciona mesa cuando corresponda, platos y cantidades válidas.')
      return
    }
    onSave({ canal: channel, mesa: table, lineas: lines })
  }
  return <form className="order-form comercial-form" onSubmit={submit}><div className="form-grid"><label className="input-row"><span>Canal de pedido</span><select value={channel} onChange={(event) => setChannel(event.target.value)}><option>Salón</option><option>WhatsApp</option><option>Llamafood</option></select></label>{channel === 'Salón' ? <label className="input-row"><span>Mesa</span><select required value={table} onChange={(event) => setTable(event.target.value)}><option value="">Selecciona mesa</option>{mesas.map((mesa) => <option key={mesa} value={mesa}>Mesa {mesa}</option>)}</select></label> : <div className="form-note">Este canal no requiere mesa.</div>}</div><div className="lines-heading"><div><h2>Platos del pedido</h2><p>El precio se calcula según el canal seleccionado.</p></div><button type="button" className="secondary-button" onClick={() => setLines([...lines, newLine()])}>+ Agregar plato</button></div><div className="line-list">{lines.map((line, index) => { const dish = selectedDish(line.platoId); return <div className="line-row comercial-line" key={line.id}><label className="input-row"><span>Plato {index + 1}</span><select required value={line.platoId} onChange={(event) => updateLine(line.id, 'platoId', event.target.value)}><option value="">Selecciona plato</option>{platos.map((plato) => <option key={plato.id} value={plato.id}>{plato.nombre}</option>)}</select></label><label className="input-row"><span>Cantidad</span><input required min="1" step="1" type="number" value={line.cantidad} onChange={(event) => updateLine(line.id, 'cantidad', event.target.value)} /></label><span className="line-price">{dish ? `S/ ${dish.precios[channel].toFixed(2)}` : 'Precio pendiente'}</span>{lines.length > 1 ? <button type="button" className="remove-line" aria-label={`Eliminar plato ${index + 1}`} onClick={() => setLines(lines.filter((item) => item.id !== line.id))}>×</button> : <span />}</div> })}</div>{error ? <div className="error-message">{error}</div> : null}<div className="order-total"><span>Total referencial</span><strong>S/ {total.toFixed(2)}</strong></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-button">Confirmar pedido</button></div></form>
}

function OrderCard({ pedido, editable, incidentRegistered, onEdit, onCancel, onIncident }) {
  const [incidentOpen, setIncidentOpen] = useState(false)
  const [detail, setDetail] = useState('')
  return <article className="order-card"><div className="order-card-heading"><div><strong>{pedido.numero}</strong><span>{pedido.canal}{pedido.mesa ? ` · Mesa ${pedido.mesa}` : ''} · {formatTime(pedido.confirmadoEn)}</span></div><StatusBadge status={pedido.estado} /></div><ul>{pedido.lineas.map((line) => <li key={line.id}><span>{line.cantidad} × {line.platoNombre}</span><strong>S/ {(line.cantidad * line.precioUnitario).toFixed(2)}</strong></li>)}</ul>{editable ? <div className="card-actions"><button type="button" className="secondary-button" onClick={() => onEdit(pedido)}>Editar</button><button type="button" className="danger-button" onClick={() => onCancel(pedido.id)}>Anular</button></div> : <div className="card-actions"><button type="button" className="secondary-button" onClick={() => setIncidentOpen(!incidentOpen)}>Registrar incidencia</button></div>}{incidentOpen ? <div className="incident-form"><input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Describe la incidencia" /><button type="button" className="primary-button" disabled={!detail.trim()} onClick={() => { onIncident(pedido.id, detail.trim()); setDetail(''); setIncidentOpen(false) }}>Guardar incidencia</button></div> : null}{incidentRegistered ? <p className="incident-success" role="status">Incidencia registrada correctamente. El pedido mantiene su estado.</p> : null}</article>
}

function Comercial({ view = 'comercial' }) {
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const { pedidos, comandas, incidencias, platos, mesas, loading, error, crearPedido, actualizarPedido, iniciarComanda, marcarListo, anularPedido, registrarIncidencia, ventanaEdicion } = useComercial()
  const [editing, setEditing] = useState(null)
  const [newOrder, setNewOrder] = useState(false)
  if (!user) return <Navigate to="/login" replace />
  if (view === 'cocina' && !['gerente', 'cocina'].includes(role)) return <Navigate to="/apps" replace />
  if (view !== 'cocina' && !['gerente', 'mozo', 'caja'].includes(role)) return <Navigate to="/apps" replace />
  const queue = pedidos.filter((pedido) => ['Pendiente', 'Confirmado', 'En preparación'].includes(pedido.estado))
  const normalizeLines = (payload) => payload.lineas.map((line) => { const dish = platos.find((item) => item.id === line.platoId); return { ...line, id: line.id || crypto.randomUUID(), platoNombre: dish.nombre, cantidad: Number(line.cantidad), precioUnitario: dish.precios[payload.canal] } })
  const handleSave = async (payload) => { try { if (editing) actualizarPedido(editing.id, { ...payload, lineas: normalizeLines(payload) }); else await crearPedido({ ...payload, lineas: normalizeLines(payload) }); setEditing(null); setNewOrder(false); navigate('/app/ventas') } catch { /* El contexto deja el error visible en pantalla. */ } }
  const activeComandas = comandas.filter((comanda) => ['Pendiente', 'Confirmado', 'En preparación'].includes(comanda.estado))
  return <div className="module-page comercial-page"><Header user={user} role={role} view={view} onNavigate={navigate} onBack={() => navigate('/apps')} /><main className="module-main comercial-main">{error ? <div className="error-message" role="alert">{error}</div> : null}{loading ? <div className="empty-state">Cargando productos y pedidos...</div> : view === 'cocina' ? <><div className="page-heading"><div><p className="eyebrow">Producción</p><h1>Pantalla de cocina</h1><p className="page-subtitle">Comandas confirmadas, en el mismo orden y cantidad del pedido.</p></div></div><section className="kitchen-grid" aria-label="Comandas de cocina">{activeComandas.map((comanda) => { const pedido = pedidos.find((item) => item.id === comanda.pedidoId); return pedido ? <article className="kitchen-card" key={comanda.id}><div className="order-card-heading"><div><strong>{comanda.numero}</strong><span>{pedido.canal}{pedido.mesa ? ` · Mesa ${pedido.mesa}` : ''}</span></div><StatusBadge status={pedido.estado} /></div><ul>{comanda.lineas.map((line) => <li key={line.platoId}><strong>{line.cantidad} ×</strong> {line.platoNombre}</li>)}</ul><button type="button" className="primary-button" onClick={() => pedido.estado === 'En preparación' ? marcarListo(pedido.id).catch(() => {}) : iniciarComanda(pedido.id).catch(() => {})}>{pedido.estado === 'En preparación' ? 'Marcar listo' : 'Iniciar preparación'}</button></article> : null })}{!activeComandas.length ? <div className="empty-state">No hay comandas pendientes.</div> : null}</section></> : editing || newOrder || view === 'new' ? <><div className="page-heading compact-heading"><div><p className="eyebrow">{editing ? 'Cola / Editar pedido' : 'Nuevo pedido'}</p><h1>{editing ? editing.numero : 'Confirmar pedido'}</h1></div></div><OrderForm platos={platos} mesas={mesas} initialOrder={editing} onSave={handleSave} onCancel={() => { setEditing(null); setNewOrder(false); navigate('/app/ventas') }} /></> : <><div className="page-heading"><div><p className="eyebrow">Módulo Comercial</p><h1>Pedidos a cocina</h1><p className="page-subtitle">Confirma pedidos de salón y canales digitales para enviarlos a producción.</p></div><button type="button" className="primary-button" onClick={() => navigate('/app/ventas/nuevo')}>+ Nuevo pedido</button></div><section className="orders-panel queue-panel" aria-label="Cola de pedidos"><div className="table-toolbar"><span>{queue.length} pedidos en cola</span><span className="toolbar-note">Edición y anulación disponibles durante 5 minutos</span></div><div className="order-card-list">{queue.map((pedido) => <OrderCard key={pedido.id} pedido={pedido} incidentRegistered={incidencias.some((incidencia) => incidencia.pedidoId === pedido.id)} editable={ventanaEdicion(pedido)} onEdit={setEditing} onCancel={anularPedido} onIncident={registrarIncidencia} />)}{!queue.length ? <div className="empty-state">No hay pedidos confirmados.</div> : null}</div></section><button type="button" className="back-link" onClick={() => navigate('/apps')}>← Volver al launcher</button></>}</main></div>
}

export default Comercial