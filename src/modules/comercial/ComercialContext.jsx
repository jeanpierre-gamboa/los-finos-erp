import { createContext, useContext, useState } from 'react'
import {
  calcularIGV,
  calcularTotalConIGV,
  formatearNumeroDocumento,
  pedidosDemo,
  comandasDemo,
  comprobantesDemo,
  preciosPorCanal,
  productos,
  siguienteCorrelativo,
} from '../../data/comercialDemo.js'

const STORAGE_KEY = 'losfinos.comercial'
const ComercialContext = createContext(null)

function readInitialData() {
  const demoComprobantes = comprobantesDemo.map((factura) => ({ ...factura, tipo: factura.tipo || 'Boleta', estadoCpe: factura.estadoCpe || 'Pendiente', fecha: factura.fecha }))
  const demoData = { pedidos: pedidosDemo, cocina: comandasDemo, comprobantes: demoComprobantes, notasCredito: [] }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const data = JSON.parse(stored)
      return {
        ...demoData,
        ...data,
        pedidos: [...demoData.pedidos, ...(data.pedidos || []).filter((pedido) => !demoData.pedidos.some((demo) => demo.id === pedido.id))],
        cocina: [...demoData.cocina, ...(data.cocina || []).filter((comanda) => !demoData.cocina.some((demo) => demo.id === comanda.id))],
        comprobantes: [...demoData.comprobantes, ...(data.comprobantes || []).filter((comprobante) => !demoData.comprobantes.some((demo) => demo.id === comprobante.id))],
      }
    }
  } catch {
    return demoData
  }
  return demoData
}

function ComercialProvider({ children }) {
  const [data, setData] = useState(readInitialData)

  const persistir = (nextData) => {
    setData(nextData)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData))
  }

  const crearPedido = ({ canal, mesa, lineas }) => {
    const subtotal = lineas.reduce((total, linea) => total + linea.cantidad * linea.precioUnitario, 0)
    const correlativo = data.pedidos.length + 1
    const pedido = {
      id: crypto.randomUUID(),
      numero: formatearNumeroDocumento('PED', correlativo, 4),
      correlativo,
      canal,
      mesa: canal === 'salon' ? mesa : '',
      lineas,
      subtotal,
      igv: calcularIGV(subtotal),
      total: calcularTotalConIGV(subtotal),
      estado: 'Confirmado',
      creadoEn: new Date().toISOString(),
      incidencia: null,
    }
    const cocina = { id: crypto.randomUUID(), pedidoId: pedido.id, numero: formatearNumeroDocumento('COM', correlativo, 4), estado: 'Pendiente', lineas, creadoEn: pedido.creadoEn, bajaReceta: [] }
    persistir({ ...data, pedidos: [...data.pedidos, pedido], cocina: [...(data.cocina || []), cocina] })
    return pedido
  }

  const actualizarPedido = (pedidoId, changes) => {
    const pedidos = data.pedidos.map((pedido) => {
      if (pedido.id !== pedidoId) return pedido
      const lineas = changes.lineas || pedido.lineas
      const subtotal = lineas.reduce((total, linea) => total + linea.cantidad * linea.precioUnitario, 0)
      return { ...pedido, ...changes, subtotal, igv: calcularIGV(subtotal), total: calcularTotalConIGV(subtotal) }
    })
    const updatedPedido = pedidos.find((pedido) => pedido.id === pedidoId)
    const cocina = (data.cocina || []).map((item) => item.pedidoId === pedidoId ? { ...item, lineas: updatedPedido.lineas } : item)
    persistir({ ...data, pedidos, cocina })
  }

  const anularPedido = (pedidoId) => actualizarPedido(pedidoId, { estado: 'Anulado', anuladoEn: new Date().toISOString() })

  const registrarIncidencia = (pedidoId, incidencia) => actualizarPedido(pedidoId, {
    incidencia: { ...incidencia, registradaEn: new Date().toISOString() },
  })

  const cambiarEstadoCocina = (cocinaId, estado) => {
    const cocina = (data.cocina || []).map((item) => item.id === cocinaId ? { ...item, estado } : item)
    persistir({ ...data, cocina })
  }

  const atenderPedido = (cocinaId) => {
    const item = data.cocina.find((cocina) => cocina.id === cocinaId)
    if (!item) return
    const bajaReceta = item.lineas.flatMap((linea) => {
      const producto = productos.find((candidate) => candidate.id === linea.productoId)
      return (producto?.receta || []).map((receta) => ({ ...receta, cantidad: Number((receta.cantidad * linea.cantidad).toFixed(3)) }))
    })
    const cocina = data.cocina.map((cocina) => cocina.id === cocinaId ? { ...cocina, estado: 'Atendido', bajaReceta, atendidoEn: new Date().toISOString() } : cocina)
    const pedidos = data.pedidos.map((pedido) => pedido.id === item.pedidoId ? { ...pedido, estado: 'Atendido' } : pedido)
    persistir({ ...data, cocina, pedidos })
  }

  const emitirComprobante = (pedidoId, datos) => {
    const pedido = data.pedidos.find((item) => item.id === pedidoId)
    if (!pedido) return
    const serie = datos.tipo === 'Factura' ? 'F001' : 'B001'
    const correlativo = siguienteCorrelativo(data.comprobantes || [], serie)
    const comprobante = { id: crypto.randomUUID(), pedidoId, tipo: datos.tipo, serie, correlativo, numero: formatearNumeroDocumento(serie, correlativo), fecha: new Date().toISOString(), medioPago: datos.medioPago, ruc: datos.ruc || '', razonSocial: datos.razonSocial || '', direccion: datos.direccion || '', base: pedido.subtotal, igv: pedido.igv, total: pedido.total, estadoCpe: 'Pendiente' }
    const pedidos = data.pedidos.map((item) => item.id === pedidoId ? { ...item, estado: 'Facturado', comprobanteId: comprobante.id } : item)
    persistir({ ...data, pedidos, comprobantes: [...(data.comprobantes || []), comprobante] })
    return comprobante
  }

  const simularSunat = (comprobanteId, estadoCpe) => {
    const comprobantes = data.comprobantes.map((comprobante) => comprobante.id === comprobanteId ? { ...comprobante, estadoCpe } : comprobante)
    persistir({ ...data, comprobantes })
  }

  const crearNotaCredito = (comprobanteId, motivo) => {
    const original = data.comprobantes.find((comprobante) => comprobante.id === comprobanteId)
    if (!original) return
    const correlativo = siguienteCorrelativo(data.notasCredito || [], 'NC01')
    const nota = { id: crypto.randomUUID(), comprobanteId, serieOriginal: original.serie, numeroOriginal: original.numero, serie: 'NC01', correlativo, numero: formatearNumeroDocumento('NC01', correlativo), motivo, estado: 'NC', fecha: new Date().toISOString() }
    persistir({ ...data, notasCredito: [...(data.notasCredito || []), nota] })
  }

  const value = {
    ...data,
    productos,
    preciosPorCanal,
    crearPedido,
    actualizarPedido,
    anularPedido,
    registrarIncidencia,
    cambiarEstadoCocina,
    atenderPedido,
    emitirComprobante,
    simularSunat,
    crearNotaCredito,
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