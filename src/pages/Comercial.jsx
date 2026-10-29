import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../app/AuthContext.jsx'
import { useComercial } from '../modules/comercial/ComercialContext.jsx'
import ComercialShell from '../modules/comercial/ComercialShell.jsx'

const API_URL = 'http://localhost:3000/api'

const newLine = () => ({ id: crypto.randomUUID(), platoId: '', cantidad: 1, committed: false })
function formatTime(timestamp) { 
  return new Intl.DateTimeFormat('es-PE', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'America/Lima'
  }).format(new Date(timestamp)) 
}
function money(value) { return `S/ ${Number(value).toFixed(2)}` }
function StatusBadge({ status }) { return <span className={`status-badge status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span> }

function OrderForm({ platos, categorias, mesas, initialOrder, onSave, onCancel }) {
  const [channel, setChannel] = useState(initialOrder?.canal || 'Salón')
  const [table, setTable] = useState(initialOrder?.mesa || '')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')
  const [lines, setLines] = useState(initialOrder?.lineas.map((line) => ({ id: line.id, platoId: line.platoId, cantidad: line.cantidad, committed: true })) || [newLine()])
  const [selectedCategory, setSelectedCategory] = useState(String(categorias[0]?.id || ''))
  const [error, setError] = useState('')

  const activeCategory = selectedCategory || String(categorias[0]?.id || '')
  const draftLine = lines.find((line) => !line.committed)
  const categoryPlatos = platos.filter((plato) => String(plato.categoriaId) === activeCategory)
  const selectedDish = (id) => platos.find((plato) => plato.id === Number(id))
  const total = lines.reduce((sum, line) => sum + (line.committed ? Number(line.cantidad || 0) * Number(selectedDish(line.platoId)?.precioActual || 0) : 0), 0)

  const updateLine = (id, field, value) => setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: value } : line))

  const confirmDraft = (event) => {
    const isLineConfirmation = event?.currentTarget?.classList.contains('line-confirm')
    if (!draftLine) {
      if (!isLineConfirmation) setLines((current) => [...current, newLine()])
      return !isLineConfirmation
    }
    if (!isLineConfirmation) {
      setError('Confirma la línea actual antes de agregar otro plato.')
      return false
    }
    if (!draftLine.platoId || Number(draftLine.cantidad) < 1) {
      setError('Selecciona un plato y una cantidad válida antes de agregarlo.')
      return false
    }
    setLines((current) => current.map((line) => line.id === draftLine.id ? { ...line, committed: true } : line))
    setError('')
    return true
  }

  const removeLine = (id) => setLines((current) => {
    const remaining = current.filter((line) => line.id !== id)
    return remaining.length ? remaining : [newLine()]
  })

  const submit = (event) => {
    event.preventDefault()
    const pending = lines.find((line) => !line.committed)
    const validLines = lines.filter((line) => line.committed && line.platoId && Number.isInteger(Number(line.cantidad)) && Number(line.cantidad) >= 1)
    if ((channel === 'Salón' && !table) || !validLines.length || pending?.platoId || validLines.length !== lines.filter((line) => line.committed).length) {
      setError(pending?.platoId ? 'Confirma la línea seleccionada antes de continuar.' : 'Selecciona mesa cuando corresponda y agrega platos válidos.')
      return
    }
    onSave({
      canal: channel,
      mesa: table,
      lineas: validLines,
      clienteNombre: channel !== 'Salón' ? clienteNombre : null,
      clienteTelefono: channel !== 'Salón' ? clienteTelefono : null,
      clienteDireccion: channel !== 'Salón' ? clienteDireccion : null,
    })
  }

  return (
    <form className="order-form comercial-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="input-row">
          <span>Canal de pedido</span>
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option>Salón</option>
            <option>WhatsApp</option>
            <option>Llamafood</option>
          </select>
        </label>
        {channel === 'Salón' ? (
          <label className="input-row">
            <span>Mesa</span>
            <select required value={table} onChange={(event) => setTable(event.target.value)}>
              <option value="">Selecciona mesa</option>
              {mesas.map((mesa) => <option key={mesa} value={mesa}>Mesa {mesa}</option>)}
            </select>
          </label>
        ) : (
          <div className="form-note">Este canal no requiere mesa.</div>
        )}
      </div>

      {channel !== 'Salón' ? (
        <div className="form-grid">
          <label className="input-row">
            <span>Nombre del cliente</span>
            <input required value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre" />
          </label>
          <label className="input-row">
            <span>Teléfono</span>
            <input required value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} placeholder="Teléfono" />
          </label>
          <label className="input-row">
            <span>Dirección / Referencia</span>
            <input required value={clienteDireccion} onChange={(e) => setClienteDireccion(e.target.value)} placeholder="Dirección de entrega" />
          </label>
        </div>
      ) : null}

      <div className="lines-heading">
        <div>
          <h2>Platos del pedido</h2>
          <p>El precio se toma de la ficha actual del producto.</p>
        </div>
        <button type="button" className="secondary-button" onClick={confirmDraft}>+ Agregar plato</button>
      </div>

      <div className="category-tabs" aria-label="Categorías de productos">
        {categorias.map((categoria) => (
          <button type="button" key={categoria.id} className={String(categoria.id) === activeCategory ? 'active' : ''} onClick={() => setSelectedCategory(String(categoria.id))}>
            {categoria.nombre}
          </button>
        ))}
      </div>

      <div className="line-list">
        {lines.map((line, index) => {
          const dish = selectedDish(line.platoId)
          return (
            <div className={`line-row comercial-line ${line.committed ? 'line-committed' : 'line-draft'}`} key={line.id}>
              {line.committed ? (
                <span className="line-dish">{dish?.nombre}</span>
              ) : (
                <label className="input-row">
                  <span>Plato {index + 1}</span>
                  <select required value={line.platoId} onChange={(event) => updateLine(line.id, 'platoId', event.target.value)}>
                    <option value="">Selecciona plato</option>
                    {categoryPlatos.map((plato) => <option key={plato.id} value={plato.id}>{plato.nombre}</option>)}
                  </select>
                </label>
              )}
              <label className="input-row">
                <span>Cantidad</span>
                <input required={line.committed} min="1" step="1" type="number" value={line.cantidad} onChange={(event) => updateLine(line.id, 'cantidad', event.target.value)} />
              </label>
              {line.committed ? (
                <span className="line-price">{money(dish?.precioActual || 0)}</span>
              ) : (
                <button type="button" className="secondary-button line-confirm" onClick={confirmDraft}>Confirmar</button>
              )}
              <button type="button" className="remove-line" aria-label={`Eliminar plato ${index + 1}`} onClick={() => removeLine(line.id)}>x</button>
            </div>
          )
        })}
      </div>

      {error ? <div className="error-message">{error}</div> : null}
      <div className="order-total">
        <span>Total referencial</span>
        <strong>{money(total)}</strong>
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary-button">Confirmar pedido</button>
      </div>
    </form>
  )
}

const RESOLVE_LABELS = { Cocina: 'Rehacer plato', Caja: 'Ajustar cobro', 'Atención': 'Registrar solución' }

function IncidentActions({ pedidoId }) {
  const navigate = useNavigate()
  const { incidencias, registrarIncidencia, resolverIncidencia } = useComercial()
  const [incidentOpen, setIncidentOpen] = useState(false)
  const [tipo, setTipo] = useState('Falla de producto')
  const [motivo, setMotivo] = useState('')
  const [responsable, setResponsable] = useState('')
  const incident = incidencias.find((item) => item.pedidoId === pedidoId)
  const submit = async () => {
    if (!motivo.trim() || !responsable) return
    await registrarIncidencia(pedidoId, tipo, motivo.trim(), responsable)
    setMotivo('')
    setResponsable('')
    setIncidentOpen(false)
  }
  return (
    <>
      {incident ? (
        <div className="incident-success" role="status">
          <strong>Incidencia registrada</strong> · {incident.tipo} · Asignado a {incident.responsable}
          <div>{incident.motivo}</div>
          {incident.estado === 'Cerrada' ? (
            <div><strong>Incidencia cerrada</strong></div>
          ) : (
            <button type="button" className="credit-link" onClick={() => resolverIncidencia(incident.id).catch(() => {})}>
              {RESOLVE_LABELS[incident.responsable] || RESOLVE_LABELS['Atención']}
            </button>
          )}
          {['Falla de producto', 'Devolución'].includes(incident.tipo) ? (
            <button type="button" className="credit-link" onClick={() => navigate(`/app/ventas/cobro?pedidoId=${pedidoId}&tipo=Nota%20de%20crédito`)}>
              Generar nota de crédito
            </button>
          ) : null}
        </div>
      ) : null}
      {!incident ? <button type="button" className="secondary-button" onClick={() => setIncidentOpen(true)}>Registrar incidencia</button> : null}
      {!incident && incidentOpen ? (
        <div className="incident-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIncidentOpen(false) }}>
          <div className="incident-modal" role="dialog" aria-modal="true" aria-label="Registrar incidencia">
            <div className="incident-modal-heading">
              <h3>Registrar incidencia</h3>
              <button type="button" className="modal-close" onClick={() => setIncidentOpen(false)}>x</button>
            </div>
            <label className="input-row">
              <span>Tipo</span>
              <select value={tipo} onChange={(event) => setTipo(event.target.value)}>
                <option>Falla de producto</option>
                <option>Retraso</option>
                <option>Cambio</option>
                <option>Devolución</option>
                <option>Otro</option>
              </select>
            </label>
            <label className="input-row">
              <span>Responsable</span>
              <select value={responsable} onChange={(event) => setResponsable(event.target.value)}>
                <option value="">Selecciona responsable</option>
                <option value="Cocina">Cocina</option>
                <option value="Caja">Caja</option>
                <option value="Atención">Atención</option>
              </select>
            </label>
            <label className="input-row">
              <span>Motivo</span>
              <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Describe el motivo" />
            </label>
            <button type="button" className="primary-button" disabled={!motivo.trim() || !responsable} onClick={() => submit().catch(() => {})}>
              Guardar incidencia
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function CancelDialog({ pedido, comprobante, onConfirm, onClose }) {
  const navigate = useNavigate()
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const confirm = async () => {
    if (!motivo.trim()) return
    setSaving(true)
    try {
      await onConfirm(pedido.id, motivo.trim())
      onClose()
    } catch {
      setSaving(false)
    }
  }
  return (
    <div className="incident-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="incident-modal" role="dialog" aria-modal="true" aria-label="Anular pedido">
        <div className="incident-modal-heading">
          <h3>Anular pedido</h3>
          <button type="button" className="modal-close" onClick={onClose}>x</button>
        </div>
        {comprobante ? <div className="cancel-warning">Este pedido tiene comprobante emitido. Al anularlo, puedes generar una nota de crédito.</div> : null}
        <label className="input-row">
          <span>Motivo de anulación</span>
          <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Describe el motivo" />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="button" className="danger-button" disabled={!motivo.trim() || saving} onClick={() => confirm().catch(() => {})}>
            Anular pedido
          </button>
          {comprobante ? (
            <button type="button" className="secondary-button" onClick={() => navigate(`/app/ventas/cobro?pedidoId=${pedido.id}&tipo=Nota%20de%20crédito`)}>
              Generar nota de crédito
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CancelAction({ pedido, onCancel }) {
  const { facturas, anularPedido } = useComercial()
  const [cancelOpen, setCancelOpen] = useState(false)
  const comprobante = facturas.find((factura) => factura.pedidoId === pedido.id && factura.tipo !== 'Nota de crédito')
  return (
    <>
      <button type="button" className="danger-button" onClick={() => setCancelOpen(true)}>Anular</button>
      {cancelOpen ? <CancelDialog pedido={pedido} comprobante={comprobante} onConfirm={onCancel || anularPedido} onClose={() => setCancelOpen(false)} /> : null}
    </>
  )
}

function canEditOrCancel(pedido) {
  if (!['Pendiente', 'En preparación'].includes(pedido.estado)) return false;
  const minutos = (Date.now() - pedido.confirmadoEn) / 60000;
  return minutos <= 5;
}

function OrderCard({ pedido, onEdit, onCancel }) {
  const canModify = canEditOrCancel(pedido)
  return (
    <article className="order-card">
      <div className="order-card-heading">
        <div>
          <strong>{pedido.numero}</strong>
          <span>{pedido.canal}{pedido.mesa ? ` · Mesa ${pedido.mesa}` : ''} · {formatTime(pedido.confirmadoEn)}</span>
        </div>
        <StatusBadge status={pedido.estado} />
      </div>
      <ul>
        {pedido.lineas.map((line) => (
          <li key={line.id}>
            <span>{line.cantidad} × {line.platoNombre}</span>
            <strong>{money(line.cantidad * line.precioUnitario)}</strong>
          </li>
        ))}
      </ul>
      <div className="card-actions">
        {canModify ? (
          <>
            <button type="button" className="secondary-button" onClick={() => onEdit(pedido)}>Editar</button>
            <CancelAction pedido={pedido} onCancel={onCancel} />
          </>
        ) : null}
        <IncidentActions pedidoId={pedido.id} />
      </div>
    </article>
  )
}

function KitchenColumn({ title, status, tone, pedidos, readOnly, onStart, onReady }) {
  // Solo el estado efectivo exacto de la columna; ningún estado desconocido cae en otra.
  const items = pedidos
    .filter((pedido) => pedido.estado === status)
    .sort((left, right) => left.confirmadoEn - right.confirmadoEn || left.id - right.id)

  return (
    <section className={`kitchen-column kitchen-column-${tone}`} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <span>{items.length}</span>
      </header>
      {items.map((pedido) => (
        <article className="kitchen-card" key={pedido.id}>
          <div className="order-card-heading">
            <div>
              <strong>{`COM-${String(pedido.id).padStart(3, '0')}`}</strong>
              <span>{pedido.canal}{pedido.mesa ? ` · Mesa ${pedido.mesa}` : ''}</span>
            </div>
            <StatusBadge status={pedido.estado} />
          </div>
          <ul>
            {pedido.lineas.map((line) => (
              <li key={line.id ?? line.platoId}>
                <strong>{line.cantidad} ×</strong> {line.platoNombre}
              </li>
            ))}
          </ul>
          {status !== 'Listo' && !readOnly ? (
            <button type="button" className="primary-button" onClick={() => status === 'En preparación' ? onReady(pedido.id).catch(() => {}) : onStart(pedido.id).catch(() => {})}>
              {status === 'En preparación' ? 'Marcar listo' : 'Iniciar preparación'}
            </button>
          ) : null}
        </article>
      ))}
      {!items.length ? <div className="kitchen-empty">Sin comandas</div> : null}
    </section>
  )
}

function KitchenScreen({ iniciarComanda, marcarListo }) {
  const [fecha, setFecha] = useState('') // vacío = hoy (el servidor lo resuelve en America/Lima)
  const [refreshKey, setRefreshKey] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: '' })
  const requestKey = `${fecha}|${refreshKey}`

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/cocina/pedidos${fecha ? `?fecha=${fecha}` : ''}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las comandas.')
        return body
      })
      .then((data) => { if (!cancelled) setResult({ key: requestKey, data, error: '' }) })
      .catch((requestError) => { if (!cancelled) setResult({ key: requestKey, data: null, error: requestError.message }) })
    return () => { cancelled = true }
  }, [fecha, refreshKey, requestKey])

  const data = result.data
  const loading = result.key !== requestKey && !result.data
  const failed = result.key === requestKey ? result.error : ''
  const readOnly = Boolean(data) && data.fecha !== data.hoy
  const shownDate = data?.fecha || fecha
  const label = shownDate ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${shownDate}T00:00:00Z`)) : ''
  const pedidos = data && !failed ? data.pedidos : []
  const refreshAfter = (action) => async (pedidoId) => {
    await action(pedidoId)
    setRefreshKey((key) => key + 1)
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Producción</p>
          <h1>Pantalla de cocina</h1>
          <p className="page-subtitle">{label ? `Comandas del ${label}${readOnly ? ' (modo consulta)' : ''}.` : 'Comandas organizadas por estado.'}</p>
        </div>
        <div className="cm-queue-tools">
          <label className="queue-filter">
            <span>Fecha</span>
            <input type="date" value={shownDate} onChange={(event) => { setResult({ key: null, data: null, error: '' }); setFecha(event.target.value) }} />
          </label>
          <button type="button" className="secondary-button" onClick={() => { setResult({ key: null, data: null, error: '' }); setFecha('') }}>Hoy</button>
        </div>
      </div>
      {data?.anteriores?.cantidad ? (
        <div className="kitchen-notice" role="status">
          <span>Hay {data.anteriores.cantidad} pedido(s) Pendiente o En preparación de fechas anteriores. No se modifican automáticamente.</span>
          <span className="kitchen-notice-links">
            {data.anteriores.fechas.map((item) => (
              <button type="button" key={item.fecha} className="secondary-button" onClick={() => { setResult({ key: null, data: null, error: '' }); setFecha(item.fecha) }}>{item.fecha} ({item.cantidad})</button>
            ))}
          </span>
        </div>
      ) : null}
      {failed ? <div className="error-message" role="alert">{failed}</div> : null}
      {loading ? <div className="empty-state">Cargando comandas...</div> : (
        <div className="kitchen-board">
          <KitchenColumn title="En cola" status="Pendiente" tone="pending" pedidos={pedidos} readOnly={readOnly} onStart={refreshAfter(iniciarComanda)} onReady={refreshAfter(marcarListo)} />
          <KitchenColumn title="En preparación" status="En preparación" tone="preparing" pedidos={pedidos} readOnly={readOnly} onStart={refreshAfter(iniciarComanda)} onReady={refreshAfter(marcarListo)} />
          <KitchenColumn title="Listas" status="Listo" tone="ready" pedidos={pedidos} readOnly={readOnly} onStart={refreshAfter(iniciarComanda)} onReady={refreshAfter(marcarListo)} />
        </div>
      )}
    </>
  )
}

function BillingScreen({ pedidos, facturas, emitirComprobante, actualizarEstadoSunat, emitirNotaCredito }) {
  const [searchParams] = useSearchParams()
  const incidentPedidoId = searchParams.get('pedidoId')
  const incidentCredit = searchParams.get('tipo') === 'Nota de crédito'
  const emittedOrderIds = new Set(facturas.filter((factura) => factura.tipo !== 'Nota de crédito').map((factura) => Number(factura.pedidoId)))
  const availableOrders = pedidos.filter((pedido) => pedido.estado !== 'Anulado' && (incidentCredit || !emittedOrderIds.has(Number(pedido.id))))
  const [selectedId, setSelectedId] = useState(incidentPedidoId || String(availableOrders[0]?.id || ''))
  const [tipo, setTipo] = useState(incidentCredit ? 'Nota de crédito' : 'Boleta')
  const [medioPago, setMedioPago] = useState('Efectivo')
  const [ruc, setRuc] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [issued, setIssued] = useState(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [pagoConfirmado, setPagoConfirmado] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [billingError, setBillingError] = useState('')
  const showError = (message) => {
    setBillingError(message)
    setTimeout(() => setBillingError((current) => current === message ? '' : current), 3000)
  }
  const selectedOrder = availableOrders.find((pedido) => String(pedido.id) === String(selectedId))
  const originalComprobante = facturas.find((factura) => factura.pedidoId === Number(selectedId) && factura.tipo !== 'Nota de crédito')
  const orderTotal = selectedOrder?.lineas.reduce((sum, line) => sum + line.cantidad * line.precioUnitario, 0) || 0
  const base = orderTotal / 1.18
  const igv = orderTotal - base

  const rejectPayment = () => {
    setPagoConfirmado(false)
    setMedioPago('')
    showError('El pago no fue confirmado. Selecciona nuevamente el medio de pago.')
  }

  const issue = async (event) => {
    event.preventDefault()
    if (submitting) return
    if (!selectedOrder) {
      showError('Selecciona un pedido para emitir el comprobante.')
      return
    }
    if (tipo === 'Nota de crédito') {
      showError('Las notas de crédito se emiten desde "Ventas del período" o desde el comprobante emitido, indicando el motivo.')
      return
    }
    if (!medioPago) {
      showError('Selecciona un medio de pago.')
      return
    }
    if (!pagoConfirmado) {
      showError('Confirma que el pago fue recibido antes de emitir.')
      return
    }
    if (tipo === 'Factura' && (!/^\d{11}$/.test(ruc.trim()) || !razonSocial.trim())) {
      showError('Para emitir una Factura ingresa un RUC de 11 dígitos y la razón social.')
      return
    }
    setSubmitting(true)
    try {
      const comprobante = await emitirComprobante({
        pedidoId: selectedOrder.id,
        numeroPedido: selectedOrder.numero,
        tipo,
        medioPago,
        ruc: ruc.trim(),
        razonSocial: razonSocial.trim(),
        base,
        igv,
        total: orderTotal,
        serie: tipo === 'Factura' ? 'F001' : tipo === 'Nota de crédito' ? 'NC01' : 'B001',
        originalComprobanteId: tipo === 'Nota de crédito' ? originalComprobante?.id : null,
      })
      setIssued(comprobante)
      setShowReceipt(false)
      setBillingError('')
      setPagoConfirmado(false)
      setSelectedId('')
    } catch (requestError) {
      setIssued(null)
      showError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="billing-layout">
      <div className="billing-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Comercial</p>
            <h1>Cobro</h1>
            <p className="page-subtitle">Emisión demo de comprobantes.</p>
          </div>
        </div>
        <form className="billing-form" onSubmit={issue}>
          <label className="input-row">
            <span>Pedido</span>
            <select required value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setIssued(null); setBillingError('') }}>
              <option value="">Selecciona pedido</option>
              {availableOrders.map((pedido) => <option key={pedido.id} value={pedido.id}>{pedido.numero} · {pedido.canal}</option>)}
            </select>
          </label>
          <div className="document-toggle">
            <button type="button" className={tipo === 'Boleta' ? 'active' : ''} onClick={() => setTipo('Boleta')}>Boleta</button>
            <button type="button" className={tipo === 'Factura' ? 'active' : ''} onClick={() => setTipo('Factura')}>Factura</button>
          </div>
          <label className="input-row">
            <span>Medio de pago</span>
            <select value={medioPago} onChange={(event) => { setMedioPago(event.target.value); setPagoConfirmado(false) }}>
              <option value="">Selecciona medio de pago</option>
              <option>Efectivo</option>
              <option>Tarjeta</option>
              <option>Yape</option>
              <option>Plin</option>
              <option>Transferencia</option>
            </select>
          </label>
          {medioPago ? (
            <div className="payment-confirm">
              {pagoConfirmado ? (
                <span>Pago confirmado ({medioPago})</span>
              ) : (
                <>
                  <button type="button" className="secondary-button" onClick={() => setPagoConfirmado(true)}>Confirmar pago recibido</button>
                  <button type="button" className="secondary-button" onClick={rejectPayment}>Pago no confirmado</button>
                </>
              )}
            </div>
          ) : null}
          {tipo === 'Factura' ? (
            <div className="form-grid">
              <label className="input-row">
                <span>RUC</span>
                <input required value={ruc} onChange={(event) => setRuc(event.target.value)} placeholder="20123456789" />
              </label>
              <label className="input-row">
                <span>Razón social</span>
                <input required value={razonSocial} onChange={(event) => setRazonSocial(event.target.value)} placeholder="Cliente demo S.A.C." />
              </label>
            </div>
          ) : null}
          <div className="invoice-totals">
            <span>Base <strong>{money(base)}</strong></span>
            <span>IGV 18% <strong>{money(igv)}</strong></span>
            <span>Total <strong>{money(orderTotal)}</strong></span>
          </div>
          {billingError ? <div className="error-message" role="alert">{billingError}</div> : null}
          <button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Emitiendo...' : 'Emitir comprobante'}</button>
        </form>
      </div>
      {issued && !showReceipt ? (
        <div className="billing-panel billing-help">
          <h2>Comprobante emitido</h2>
          <p>{issued.serie}-{issued.correlativo} · {money(issued.total)}</p>
          <button type="button" className="primary-button" onClick={() => setShowReceipt(true)}>Ver comprobante</button>
        </div>
      ) : issued ? (
        <ReceiptCard
          factura={issued}
          onSunat={async (status) => { const updated = await actualizarEstadoSunat(issued.id, status); setIssued((current) => ({ ...current, estadoSunat: updated.estadoSunat })) }}
          onCredit={(motivo) => emitirNotaCredito(issued, motivo)}
        />
      ) : (
        <div className="billing-panel billing-help">
          <h2>Comprobante</h2>
          <p>Selecciona un pedido para generar una serie y correlativo de ejemplo.</p>
        </div>
      )}
    </section>
  )
}

function ReceiptCard({ factura, onSunat, onCredit }) {
  const [sunatStatus, setSunatStatus] = useState(factura.estadoSunat)
  const [creditNote, setCreditNote] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [message, setMessage] = useState('')
  const showMessage = (text) => {
    setMessage(text)
    setTimeout(() => setMessage((current) => current === text ? '' : current), 3000)
  }
  const simulateSunat = async (status) => {
    try {
      await onSunat(status)
      setSunatStatus(status)
    } catch (requestError) {
      showMessage(requestError.message)
    }
  }
  const issueCredit = async () => {
    if (!motivo.trim()) {
      showMessage('Ingresa el motivo de la nota de crédito.')
      return
    }
    try {
      setCreditNote(await onCredit(motivo.trim()))
      setMotivo('')
    } catch (requestError) {
      showMessage(requestError.message)
    }
  }
  return (
    <article className="receipt-card">
      <div className="receipt-heading">
        <div>
          <p className="eyebrow">Comprobante emitido</p>
          <h2>{factura.serie}-{factura.correlativo}</h2>
        </div>
        <span className={`sunat-status sunat-${sunatStatus.toLowerCase()}`}>{sunatStatus}</span>
      </div>
      <p>{factura.tipo} · {factura.numeroPedido}</p>
      <p>Medio de pago: <strong>{factura.medioPago}</strong></p>
      {factura.tipo === 'Factura' ? <p>{factura.ruc} · {factura.razonSocial}</p> : null}
      <div className="invoice-totals">
        <span>Base <strong>{money(factura.base)}</strong></span>
        <span>IGV <strong>{money(factura.igv)}</strong></span>
        <span>Total <strong>{money(factura.total)}</strong></span>
      </div>
      <h3>Simular respuesta SUNAT</h3>
      <div className="sunat-actions">
        <button type="button" onClick={() => simulateSunat('Aceptado')}>Aceptado</button>
        <button type="button" onClick={() => simulateSunat('Rechazado')}>Rechazado</button>
        <button type="button" onClick={() => simulateSunat('Contingencia')}>Contingencia</button>
      </div>
      <label className="input-row">
        <span>Motivo de nota de crédito</span>
        <input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Motivo obligatorio" disabled={Boolean(creditNote)} />
      </label>
      <button type="button" className="secondary-button" onClick={issueCredit} disabled={Boolean(creditNote)}>Emitir nota de crédito</button>
      {message ? <div className="error-message" role="alert">{message}</div> : null}
      {creditNote ? (
        <div className="credit-note">
          <p>Nota de crédito: <strong>{creditNote.serie}-{creditNote.correlativo}</strong></p>
          <p>Total: {money(creditNote.total)} · Estado SUNAT: {creditNote.estadoSunat}</p>
          <p>Motivo: {creditNote.motivo}</p>
        </div>
      ) : null}
    </article>
  )
}

function SalesPeriodScreen({ facturas }) {
  const { actualizarEstadoSunat, emitirNotaCredito } = useComercial()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [creditTarget, setCreditTarget] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [creditError, setCreditError] = useState('')
  const [detail, setDetail] = useState(null)
  const [exportError, setExportError] = useState('')
  const changeSunat = (id, status) => actualizarEstadoSunat(id, status).catch(() => {})
  const rangeInvalid = Boolean(from && to && from > to)
  const filtered = rangeInvalid ? [] : facturas.filter((factura) => {
    const emitted = new Date(factura.emitidoEn)
    const after = !from || emitted >= new Date(`${from}T00:00:00`)
    const before = !to || emitted <= new Date(`${to}T23:59:59.999`)
    return after && before
  })
  // Las notas de crédito tienen importes negativos, por lo que restan del período; los rechazados no cuentan.
  const totals = filtered.filter((factura) => factura.estadoSunat !== 'Rechazado').reduce((sum, factura) => ({
    base: sum.base + Number(factura.base),
    igv: sum.igv + Number(factura.igv),
    total: sum.total + Number(factura.total),
  }), { base: 0, igv: 0, total: 0 })

  const localDate = (timestamp) => {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const exportRvie = () => {
    if (!filtered.length) {
      setExportError('No hay comprobantes en el período para exportar.')
      setTimeout(() => setExportError(''), 3000)
      return
    }
    const rows = [['Tipo documento', 'Serie', 'Correlativo', 'Fecha', 'Base', 'IGV', 'Total', 'Estado SUNAT'], ...filtered.map((factura) => [
      factura.tipo, factura.serie, factura.correlativo, localDate(factura.emitidoEn),
      factura.base.toFixed(2), factura.igv.toFixed(2), factura.total.toFixed(2), factura.estadoSunat,
    ])]
    rows.push(['', '', '', 'TOTAL (sin rechazados)', totals.base.toFixed(2), totals.igv.toFixed(2), totals.total.toFixed(2), ''])
    const csv = '\ufeff' + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `Resumen-ventas-${from || 'inicio'}-${to || 'hoy'}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const submitCredit = async () => {
    if (!creditTarget) return
    if (!motivo.trim()) {
      setCreditError('El motivo de la nota de crédito es obligatorio.')
      setTimeout(() => setCreditError(''), 3000)
      return
    }
    try {
      const note = await emitirNotaCredito(creditTarget, motivo.trim())
      setCreditTarget(null)
      setMotivo('')
      setCreditError('')
      setDetail(note)
    } catch (requestError) {
      setCreditError(requestError.message)
      setTimeout(() => setCreditError((current) => current === requestError.message ? '' : current), 3000)
    }
  }

  return (
    <section className="period-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Comercial</p>
          <h1>Ventas del período</h1>
          <p className="page-subtitle">Reporte de comprobantes para SIRE/RVIE.</p>
        </div>
        <button type="button" className="primary-button" onClick={exportRvie}>Exportar resumen</button>
      </div>
      <div className="period-filters">
        <label className="input-row">
          <span>Desde</span>
          <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="input-row">
          <span>Hasta</span>
          <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      {rangeInvalid ? <div className="error-message" role="alert">La fecha "Desde" no puede ser posterior a "Hasta".</div> : null}
      {exportError ? <div className="error-message" role="alert">{exportError}</div> : null}
      {filtered.length ? (
        <div className="period-table">
          <div className="period-header-row">
            <strong>Serie-Correlativo</strong>
            <strong>Tipo</strong>
            <strong>Pedido</strong>
            <strong>Fecha</strong>
            <strong>Base</strong>
            <strong>IGV</strong>
            <strong>Total</strong>
            <strong>Estado SUNAT</strong>
            <strong>Acciones</strong>
          </div>
          {filtered.map((factura) => (
            <div className={`period-row ${factura.tipo === 'Nota de crédito' ? 'period-credit-row' : ''}`} key={factura.id}>
              <strong>{factura.serie}-{factura.correlativo}</strong>
              <span>{factura.tipo}</span>
              <span>{factura.numeroPedido || `Pedido ${factura.pedidoId}`}</span>
              <span>{new Intl.DateTimeFormat('es-PE').format(new Date(factura.emitidoEn))}</span>
              <span>{money(factura.base)}</span>
              <span>{money(factura.igv)}</span>
              <span>{money(factura.total)}</span>
              <span className={`sunat-status sunat-${factura.estadoSunat.toLowerCase()}`}>{factura.estadoSunat}</span>
              <div className="period-sunat-actions">
                <button type="button" className="sunat-small-button" onClick={() => setDetail(factura)}>Ver</button>
                {factura.tipo !== 'Nota de crédito' ? (
                  <>
                    <button type="button" className="sunat-small-button" onClick={() => changeSunat(factura.id, 'Aceptado')}>Aceptado</button>
                    <button type="button" className="sunat-small-button" onClick={() => changeSunat(factura.id, 'Rechazado')}>Rechazado</button>
                    <button type="button" className="sunat-small-button" onClick={() => changeSunat(factura.id, 'Contingencia')}>Contingencia</button>
                    {factura.estadoSunat === 'Aceptado' ? (
                      <button type="button" className="credit-small-button" onClick={() => { setCreditTarget(factura); setMotivo(''); setCreditError('') }}>
                        Nota de crédito
                      </button>
                    ) : null}
                  </>
                ) : (
                  <span className="credit-label">Nota de crédito</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">No hay comprobantes en el rango seleccionado.</div>
      )}
      <div className="period-totals">
        <span>Base imponible <strong>{money(totals.base)}</strong></span>
        <span>IGV <strong>{money(totals.igv)}</strong></span>
        <span>Total neto <strong>{money(totals.total)}</strong></span>
      </div>
      {detail ? (
        <div className="incident-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null) }}>
          <div className="incident-modal" role="dialog" aria-modal="true" aria-label="Detalle del comprobante">
            <div className="incident-modal-heading">
              <h3>{detail.tipo} {detail.serie}-{detail.correlativo}</h3>
              <button type="button" className="modal-close" onClick={() => setDetail(null)}>x</button>
            </div>
            <p>Pedido: {detail.numeroPedido || `Pedido ${detail.pedidoId}`}</p>
            <p>Fecha: {new Date(detail.emitidoEn).toLocaleString('es-PE')}</p>
            <p>Medio de pago: <strong>{detail.medioPago}</strong></p>
            {detail.tipo === 'Factura' ? <p>{detail.ruc} · {detail.razonSocial}</p> : null}
            {detail.tipo === 'Nota de crédito' ? (
              <>
                <p>Comprobante original: {(() => { const original = facturas.find((item) => item.id === detail.originalComprobanteId); return original ? `${original.serie}-${original.correlativo}` : detail.originalComprobanteId })()}</p>
                <p>Motivo: {detail.motivo}</p>
              </>
            ) : null}
            <div className="invoice-totals">
              <span>Base <strong>{money(detail.base)}</strong></span>
              <span>IGV <strong>{money(detail.igv)}</strong></span>
              <span>Total <strong>{money(detail.total)}</strong></span>
            </div>
            <p>Estado SUNAT: <strong>{facturas.find((item) => item.id === detail.id)?.estadoSunat || detail.estadoSunat}</strong></p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setDetail(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      ) : null}
      {creditTarget ? (
        <div className="incident-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreditTarget(null) }}>
          <div className="incident-modal" role="dialog" aria-modal="true" aria-label="Generar nota de crédito">
            <div className="incident-modal-heading">
              <h3>Generar nota de crédito</h3>
              <button type="button" className="modal-close" onClick={() => setCreditTarget(null)}>x</button>
            </div>
            <p>Comprobante: {creditTarget.serie}-{creditTarget.correlativo}</p>
            <label className="input-row">
              <span>Motivo</span>
              <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Describe el motivo" />
            </label>
            {creditError ? <div className="error-message">{creditError}</div> : null}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setCreditTarget(null)}>Cancelar</button>
              <button type="button" className="primary-button" disabled={!motivo.trim()} onClick={() => submitCredit().catch(() => {})}>
                Generar nota de crédito
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Comercial({ view = 'comercial' }) {
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const { pedidos, incidencias, facturas, platos, categorias, mesas, loading, error, queueFilter, setQueueFilter, crearPedido, actualizarPedido, iniciarComanda, marcarListo, anularPedido, registrarIncidencia, emitirComprobante, actualizarEstadoSunat, emitirNotaCredito, ventanaEdicion } = useComercial()
  const [editing, setEditing] = useState(null)
  const [newOrder, setNewOrder] = useState(false)

  if (!user) return <Navigate to="/login" replace />
  if (view === 'cocina' && !['gerente', 'cocina'].includes(role)) return <Navigate to="/apps" replace />
  if (view !== 'cocina' && !['gerente', 'mozo', 'caja'].includes(role)) return <Navigate to="/apps" replace />

  const allQueue = pedidos.filter((pedido) => pedido.estado !== 'Anulado')
  const queue = allQueue.filter((pedido) =>
    queueFilter === 'todos' ||
    (queueFilter === 'activos' && ['Pendiente', 'En preparación'].includes(pedido.estado)) ||
    (queueFilter === 'entregados' && ['Listo', 'Entregado'].includes(pedido.estado)) ||
    (queueFilter === 'incidencia' && incidencias.some((incidencia) => incidencia.pedidoId === pedido.id))
  )

  const normalizeLines = (payload) => payload.lineas.map((line) => {
    const dish = platos.find((item) => item.id === Number(line.platoId))
    return { ...line, id: line.id || crypto.randomUUID(), platoNombre: dish.nombre, cantidad: Number(line.cantidad), precioUnitario: dish.precioActual }
  })

  const handleSave = async (payload) => {
    try {
      if (editing) actualizarPedido(editing.id, { ...payload, lineas: normalizeLines(payload) })
      else await crearPedido({ ...payload, lineas: normalizeLines(payload) })
      setEditing(null)
      setNewOrder(false)
      navigate('/app/ventas')
    } catch { /* El contexto deja el error visible en pantalla. */ }
  }

  return (
    <ComercialShell>
      <main className="module-main comercial-main">
        {error ? <div className="error-message" role="alert">{error}</div> : null}
        {view === 'cocina' ? (
          <KitchenScreen iniciarComanda={iniciarComanda} marcarListo={marcarListo} />
        ) : loading ? <div className="empty-state">Cargando productos y pedidos...</div> : view === 'cobro' ? (
          <BillingScreen pedidos={pedidos} facturas={facturas} emitirComprobante={emitirComprobante} actualizarEstadoSunat={actualizarEstadoSunat} emitirNotaCredito={emitirNotaCredito} />
        ) : view === 'periodo' ? (
          <SalesPeriodScreen facturas={facturas} />
        ) : editing || newOrder || view === 'new' ? (
          <>
            <div className="page-heading compact-heading">
              <div>
                <p className="eyebrow">{editing ? 'Cola / Editar pedido' : 'Nuevo pedido'}</p>
                <h1>{editing ? editing.numero : 'Confirmar pedido'}</h1>
              </div>
            </div>
            <OrderForm platos={platos} categorias={categorias} mesas={mesas} initialOrder={editing} onSave={handleSave} onCancel={() => { setEditing(null); setNewOrder(false); navigate('/app/ventas') }} />
          </>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">Operación</p>
                <h1>Cola de pedidos</h1>
                <p className="page-subtitle">Seguimiento de pedidos ingresados por Comercial.</p>
              </div>
              <div className="cm-queue-tools">
                <label className="queue-filter">
                  <span>Mostrar</span>
                  <select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)}>
                    <option value="activos">Activos</option>
                    <option value="todos">Todos</option>
                    <option value="entregados">Entregados</option>
                    <option value="incidencia">Con incidencia</option>
                  </select>
                </label>
                <button type="button" className="primary-button" onClick={() => setNewOrder(true)}>+ Nuevo pedido</button>
              </div>
            </div>
            <section className="order-card-list" aria-label="Pedidos en cola">
              {queue.map((pedido) => (
                <OrderCard key={pedido.id} pedido={pedido} editable={ventanaEdicion(pedido)} incidentRegistered={incidencias.some((incidencia) => incidencia.pedidoId === pedido.id)} onEdit={setEditing} onCancel={anularPedido} onIncident={registrarIncidencia} />
              ))}
              {!queue.length ? <div className="empty-state">No hay pedidos pendientes.</div> : null}
            </section>
          </>
        )}
      </main>
    </ComercialShell>
  )
}

export default Comercial