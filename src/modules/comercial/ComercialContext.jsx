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
  return {
    id: Number(product.ProductoID),
    nombre: product.NombreProducto,
    categoriaId: Number(product.CategoriaID),
    categoriaNombre: product.NombreCategoria,
    precioActual: Number(product.PrecioActual),
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

function normalizeComprobante(comprobante) {
  return {
    ...comprobante,
    id: Number(comprobante.id || comprobante.ComprobanteID),
    pedidoId: Number(comprobante.pedidoId || comprobante.PedidoID),
    base: Number(comprobante.base || comprobante.Base),
    igv: Number(comprobante.igv || comprobante.IGV),
    total: Number(comprobante.total || comprobante.Total),
    originalComprobanteId: comprobante.originalComprobanteId ? Number(comprobante.originalComprobanteId) : null,
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
  const [data, setData] = useState({ pedidos: [], comandas: [], incidencias: [], facturas: [] })
  const [platos, setPlatos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [queueFilter, setQueueFilter] = useState('activos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargarDatos = async () => {
    setLoading(true)
    try {
      const [productsResponse, categoriesResponse, ordersResponse, invoicesResponse, incidentsResponse] = await Promise.all([
        fetch(`${API_URL}/productos`),
        fetch(`${API_URL}/categorias`),
        fetch(`${API_URL}/pedidos`),
        fetch(`${API_URL}/comprobantes`),
        fetch(`${API_URL}/incidencias`),
      ])
      const products = await readResponse(productsResponse)
      const categories = await readResponse(categoriesResponse)
      const orders = await readResponse(ordersResponse)
      const invoices = await readResponse(invoicesResponse)
      const incidents = await readResponse(incidentsResponse)
      const pedidos = orders.map(normalizeOrder)
      setPlatos(products.map(normalizeProduct))
      setCategorias(categories.map((category) => ({ id: Number(category.CategoriaID), nombre: category.NombreCategoria })))
      setData((current) => ({ ...current, pedidos, comandas: pedidos.map(makeComanda), facturas: invoices.map(normalizeComprobante), incidencias: incidents }))
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
      setTimeout(() => setError((current) => current === requestError.message ? '' : current), 2500)
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
      setTimeout(() => setError((current) => current === requestError.message ? '' : current), 3000)
      throw requestError
    }
  }

  const actualizarPedido = (pedidoId, changes) => setData((current) => ({ ...current, pedidos: current.pedidos.map((pedido) => pedido.id === pedidoId ? { ...pedido, ...changes } : pedido) }))
  const anularPedido = async (pedidoId, motivo) => {
    try {
      const pedido = normalizeOrder(await readResponse(await fetch(`${API_URL}/pedidos/${pedidoId}/anular`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      })))
      setData((current) => ({ ...current, pedidos: current.pedidos.map((item) => item.id === pedido.id ? pedido : item), comandas: current.comandas.map((comanda) => comanda.pedidoId === pedido.id ? { ...comanda, estado: pedido.estado } : comanda) }))
      setError('')
      return pedido
    } catch (requestError) {
      console.error('[Comercial] Error al anular pedido:', requestError)
      setError(requestError.message)
      setTimeout(() => setError((current) => current === requestError.message ? '' : current), 3000)
      throw requestError
    }
  }
  const iniciarComanda = (pedidoId) => cambiarEstadoPedido(pedidoId, 'En preparación')
  const marcarListo = (pedidoId) => cambiarEstadoPedido(pedidoId, 'Listo')
  const registrarIncidencia = async (pedidoId, tipo, motivo) => {
    try {
      const incidencia = await readResponse(await fetch(`${API_URL}/incidencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId, tipo, motivo }),
      }))
      setData((current) => ({ ...current, incidencias: [incidencia, ...current.incidencias] }))
      setError('')
      return incidencia
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    }
  }
  const emitirComprobante = async (comprobante) => {
    try {
      const factura = normalizeComprobante(await readResponse(await fetch(`${API_URL}/comprobantes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comprobante),
      })))
      setData((current) => ({ ...current, facturas: [factura, ...current.facturas] }))
      setError('')
      return factura
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    }
  }
  const actualizarEstadoSunat = async (facturaId, estadoSunat) => {
    try {
      const factura = normalizeComprobante(await readResponse(await fetch(`${API_URL}/comprobantes/${facturaId}/sunat`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estadoSunat }),
      })))
      setData((current) => ({ ...current, facturas: current.facturas.map((item) => item.id === factura.id ? factura : item) }))
      setError('')
      return factura
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    }
  }
  const emitirNotaCredito = async (factura, motivo) => {
    try {
      const sourceFactura = typeof factura === 'object' ? factura : data.facturas.find((item) => item.id === factura)
      if (!sourceFactura) throw new Error('Comprobante original no encontrado.')
      if (sourceFactura.estadoSunat !== 'Aceptado') throw new Error('Solo se puede generar una nota de crédito para comprobantes Aceptados.')
      const correlativo = String(data.facturas.filter((item) => item.tipo === 'Nota de crédito').length + 1).padStart(8, '0')
      const note = normalizeComprobante(await readResponse(await fetch(`${API_URL}/comprobantes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId: sourceFactura.pedidoId, tipo: 'Nota de crédito', serie: 'NC01', correlativo, base: -Math.abs(sourceFactura.base), igv: -Math.abs(sourceFactura.igv), total: -Math.abs(sourceFactura.total), medioPago: sourceFactura.medioPago || 'Efectivo', originalComprobanteId: sourceFactura.id }),
      })))
      const normalizedNote = { ...note, numeroPedido: sourceFactura.numeroPedido, motivo }
      setData((current) => ({ ...current, facturas: [normalizedNote, ...current.facturas] }))
      setError('')
      return normalizedNote
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    }
  }

  const value = {
    ...data,
    platos,
    categorias,
    mesas,
    queueFilter,
    setQueueFilter,
    loading,
    error,
    recargar: cargarDatos,
    crearPedido,
    actualizarPedido,
    anularPedido,
    iniciarComanda,
    marcarListo,
    registrarIncidencia,
    emitirComprobante,
    actualizarEstadoSunat,
    emitirNotaCredito,
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
