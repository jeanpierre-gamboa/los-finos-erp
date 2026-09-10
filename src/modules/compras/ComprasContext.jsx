import { createContext, useContext, useState } from 'react'
import { insumos as insumosDemo, ordenes as ordenesDemo, proveedores as proveedoresDemo } from '../../data/comprasDemo.js'

const STORAGE_KEY = 'losfinos.compras'
const ComprasContext = createContext(null)

const makeId = () => crypto.randomUUID()

function readInitialData() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : { ordenes: ordenesDemo, proveedores: proveedoresDemo, insumos: insumosDemo }
  } catch {
    return { ordenes: ordenesDemo, proveedores: proveedoresDemo, insumos: insumosDemo }
  }
}

function ComprasProvider({ children }) {
  const [data, setData] = useState(readInitialData)

  const persistir = (nextData) => {
    setData(nextData)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData))
  }

  const crearOrden = ({ proveedorId, tipoCalendario, lineas }) => {
    const proveedor = data.proveedores.find((item) => item.id === proveedorId)
    const normalizedLines = lineas.map((linea) => {
      const insumo = data.insumos.find((item) => item.id === linea.insumoId)
      return {
        id: linea.id || makeId(),
        insumoId: linea.insumoId,
        insumoNombre: insumo?.nombre || linea.insumoNombre,
        cantidad: Number(linea.cantidad),
        unidad: linea.unidad || insumo?.unidad,
        precioUnitario: Number(linea.precioUnitario),
      }
    })
    const total = normalizedLines.reduce((sum, linea) => sum + linea.cantidad * linea.precioUnitario, 0)
    const nextOrder = {
      id: makeId(),
      numero: `OC-2026-${String(data.ordenes.length + 1).padStart(3, '0')}`,
      proveedorId,
      proveedorNombre: proveedor.nombre,
      tipoCalendario,
      estado: 'Borrador',
      fecha: new Date().toISOString().slice(0, 10),
      lineas: normalizedLines,
      total,
    }
    persistir({ ...data, ordenes: [...data.ordenes, nextOrder] })
    return nextOrder
  }

  const cambiarEstado = (orderId, expectedState, nextState) => {
    const nextOrders = data.ordenes.map((orden) => orden.id === orderId && orden.estado === expectedState ? { ...orden, estado: nextState } : orden)
    persistir({ ...data, ordenes: nextOrders })
  }

  const autorizarOrden = (orderId) => cambiarEstado(orderId, 'Borrador', 'Autorizada')
  const marcarPorRecibir = (orderId) => cambiarEstado(orderId, 'Autorizada', 'Por recibir')

  const obtenerUltimoPrecio = (insumoId, proveedorId) => {
    const matchingLines = data.ordenes
      .filter((orden) => orden.proveedorId === proveedorId)
      .flatMap((orden) => orden.lineas.map((linea) => ({ ...linea, fecha: orden.fecha })))
      .filter((linea) => linea.insumoId === insumoId && linea.precioUnitario > 0)
      .sort((first, second) => second.fecha.localeCompare(first.fecha))
    if (matchingLines[0]) return matchingLines[0].precioUnitario
    return data.insumos.find((item) => item.id === insumoId)?.ultimoPrecio || ''
  }

  const value = {
    ...data,
    crearOrden,
    autorizarOrden,
    marcarPorRecibir,
    obtenerUltimoPrecio,
  }

  return <ComprasContext.Provider value={value}>{children}</ComprasContext.Provider>
}

function useCompras() {
  const context = useContext(ComprasContext)
  if (!context) throw new Error('useCompras debe usarse dentro de ComprasProvider')
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export { ComprasProvider, useCompras }
