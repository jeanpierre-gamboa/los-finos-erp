import { createContext, useContext, useEffect, useState } from 'react'
import { mesas } from '../../data/comercialDemo.js'

const API_URL = 'http://localhost:3000/api'
const WINDOW_MS = 5 * 60 * 1000
const ComercialContext = createContext(null)

function normalizeChannel(value) {
  if (value.includes('WhatsApp')) return 'WhatsApp'
  if (value.includes('amfood') || value.includes('Llamafood')) return 'Llamafood'
  return 'Salón'
}

function normalizeProduct(product) {
  const price = Number(product.PrecioActual)
  return {
    id: Number(product.ProductoID),
    nombre: product.NombreProducto,
    precios: { 'Salón': price, WhatsApp: price, Llamafood: price },
  }
}

function normalizeOrder(order) {
  return {
    ...order,
    canal: normalizeChannel(order.canal || ''),
    lineas: order.lineas.map((line) => ({
      ...line,
      platoId: Number(line.platoId),
      cantidad: Number(line.cantidad),
      precioUnitario: Number(line.precioUnitario),
    })),
  }
}

function makeComanda(order) {
  return {
    id: `comanda-${order.id}`,
    pedidoId: order.id,
    numero: `COM-${String(order.id).padStart(3, '0')}`,
    estado: order.estado,
    lineas: order.lineas.map(({ platoId, platoNombre, cantidad }) => ({ platoId, platoNombre, cantidad })),
  }
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.')
  return body
}

function ComercialProvider({ children }) {
  const [data, setData] = useState({ pedidos: [], comandas: [], incidencias: [] })
  const [platos, setPlatos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargarDatos = async () => {
    setLoading(true)
    try {
      const [productsResponse, ordersResponse] = await Promise.all([
        fetch(`${API_URL}/productos`),
        fetch(`${API_URL}/pedidos`),
      ])
      const products = await readResponse(productsResponse)
      const orders = await readResponse(ordersResponse)
      const pedidos = orders.map(normalizeOrder)
      setPlatos(products.map(normalizeProduct))
      setData((current) => ({ ...current, pedidos, comandas: pedidos.map(makeComanda) }))
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // La carga inicial sincroniza el estado del contexto con la API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos()
  }, [])

  const crearPedido = async ({ canal, mesa, lineas }) => {
    try {
      const pedido = normalizeOrder(await readResponse(await fetch(`${API_URL}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal, mesa: canal === 'Salón' ? mesa : null, productos: lineas.map((line) => ({ productoId: Number(line.platoId), cantidad: Number(line.cantidad) })) }),
      })))
      setData((current) => ({ ...current, pedidos: [pedido, ...current.pedidos], comandas: [makeComanda(pedido), ...current.comandas] }))
      setError('')
      return pedido
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    }
  }

  const cambiarEstadoPedido = async (pedidoId, estado) => {
    try {
      const updated = normalizeOrder(await readResponse(await fetch(`${API_URL}/pedidos/${pedidoId}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })))
      setData((current) => ({
        ...current,
        pedidos: current.pedidos.map((pedido) => pedido.id === updated.id ? updated : pedido),
        comandas: current.comandas.map((comanda) => comanda.pedidoId === updated.id ? { ...comanda, estado: updated.estado } : comanda),
      }))
      setError('')
      return updated
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    }
  }

  const actualizarPedido = (pedidoId, changes) => setData((current) => ({ ...current, pedidos: current.pedidos.map((pedido) => pedido.id === pedidoId ? { ...pedido, ...changes } : pedido) }))
  const anularPedido = (pedidoId) => actualizarPedido(pedidoId, { estado: 'Anulado', anuladoEn: Date.now() })
  const iniciarComanda = (pedidoId) => cambiarEstadoPedido(pedidoId, 'En preparación')
  const marcarListo = (pedidoId) => cambiarEstadoPedido(pedidoId, 'Listo')
  const registrarIncidencia = (pedidoId, detalle) => setData((current) => ({ ...current, incidencias: [...current.incidencias, { id: crypto.randomUUID(), pedidoId, detalle, creadaEn: Date.now() }] }))

  const value = {
    ...data,
    platos,
    mesas,
    loading,
    error,
    recargar: cargarDatos,
    crearPedido,
    actualizarPedido,
    anularPedido,
    iniciarComanda,
    marcarListo,
    registrarIncidencia,
    ventanaEdicion: (pedido) => Date.now() - pedido.confirmadoEn < WINDOW_MS,
  }

  return <ComercialContext.Provider value={value}>{children}</ComercialContext.Provider>
}

function useComercial() {
  const context = useContext(ComercialContext)
  if (!context) throw new Error('useComercial debe usarse dentro de ComercialProvider')
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export { ComercialProvider, useComercial }
