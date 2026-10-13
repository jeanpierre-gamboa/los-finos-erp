import { createContext, useContext, useState } from 'react'
import { platos, mesas } from '../../data/comercialDemo.js'

const ComercialContext = createContext(null)
const WINDOW_MS = 5 * 60 * 1000
const makeId = () => crypto.randomUUID()

function ComercialProvider({ children }) {
  const [data, setData] = useState({ pedidos: [], comandas: [], incidencias: [] })

  const crearPedido = ({ canal, mesa, lineas }) => {
    const now = Date.now()
    const normalizedLines = lineas.map((linea) => {
      const plato = platos.find((item) => item.id === linea.platoId)
      return {
        id: makeId(),
        platoId: linea.platoId,
        platoNombre: plato.nombre,
        cantidad: Number(linea.cantidad),
        precioUnitario: plato.precios[canal],
      }
    })
    const pedido = {
      id: makeId(),
      numero: `PED-${String(data.pedidos.length + 1).padStart(3, '0')}`,
      canal,
      mesa: canal === 'Salón' ? mesa : '',
      estado: 'Confirmado',
      confirmadoEn: now,
      lineas: normalizedLines,
    }
    const comanda = {
      id: makeId(),
      pedidoId: pedido.id,
      numero: `COM-${String(data.comandas.length + 1).padStart(3, '0')}`,
      estado: 'Pendiente',
      creadaEn: now,
      lineas: normalizedLines.map(({ platoId, platoNombre, cantidad }) => ({ platoId, platoNombre, cantidad })),
    }
    setData((current) => ({ ...current, pedidos: [...current.pedidos, pedido], comandas: [...current.comandas, comanda] }))
    return pedido
  }

  const actualizarPedido = (pedidoId, changes) => {
    setData((current) => ({
      ...current,
      pedidos: current.pedidos.map((pedido) => pedido.id === pedidoId ? { ...pedido, ...changes } : pedido),
    }))
  }

  const anularPedido = (pedidoId) => actualizarPedido(pedidoId, { estado: 'Anulado', anuladoEn: Date.now() })

  const iniciarComanda = (pedidoId) => {
    actualizarPedido(pedidoId, { estado: 'En preparación' })
    setData((current) => ({ ...current, comandas: current.comandas.map((comanda) => comanda.pedidoId === pedidoId ? { ...comanda, estado: 'En preparación' } : comanda) }))
  }

  const registrarIncidencia = (pedidoId, detalle) => {
    setData((current) => ({ ...current, incidencias: [...current.incidencias, { id: makeId(), pedidoId, detalle, creadaEn: Date.now() }] }))
  }

  const value = {
    ...data,
    platos,
    mesas,
    crearPedido,
    actualizarPedido,
    anularPedido,
    iniciarComanda,
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