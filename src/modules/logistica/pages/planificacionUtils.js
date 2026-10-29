export const PLATOS_MAX_ID = 7 // productos 1-7 son platos; 8-10 son bebidas/extras

const moneda = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtSoles = (n) => `S/ ${moneda.format(n)}`

export const fmtNum = (n, decimales = 2) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n)

export const fmtPct = (fraccion) => (fraccion == null ? 'No calculable' : `${fmtNum(fraccion * 100, 1)} %`)

// Las fechas del JSON son AAAA-MM-DD; se formatean sin pasar por Date para evitar desfases de zona horaria.
export const fmtFechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
export const fmtFecha = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export const diaSemana = (iso) => DIAS[new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()]

export const fmtExportado = (iso) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })

export const unidadCorta = (unidad) => {
  const m = /\(([^)]+)\)\s*$/.exec(unidad)
  return m ? m[1] : unidad
}

export const sumar = (filas, campo) => filas.reduce((acc, fila) => acc + fila[campo], 0)

// Fecha límite (inclusive) de los primeros 7 días del horizonte.
export const finPrimerosDias = (periodoDesde, dias = 7) => {
  const d = new Date(Date.UTC(+periodoDesde.slice(0, 4), +periodoDesde.slice(5, 7) - 1, +periodoDesde.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + dias - 1)
  return d.toISOString().slice(0, 10)
}

export function totalesPorProducto(pronostico, productos, desde) {
  const fin7 = finPrimerosDias(desde, 7)
  return productos.map((p) => {
    const filas = pronostico.filter((r) => r.productoId === p.id)
    return {
      ...p,
      dias7: sumar(filas.filter((r) => r.fecha <= fin7), 'unidades'),
      dias14: sumar(filas, 'unidades'),
      diasDisponibles: filas.filter((r) => r.disponible === 1).length,
      diasTotales: filas.length,
    }
  })
}

export function indicadores(data) {
  const totales = totalesPorProducto(data.pronostico, data.productos, data.meta.periodo.desde)
  const platos = totales.filter((p) => p.esPlato)
  const urgentes = data.propuestas.filter((r) => r.tipo === 'Urgente propuesta').length
  return {
    platos7: sumar(platos, 'dias7'),
    platos14: sumar(platos, 'dias14'),
    importe: sumar(data.propuestas, 'importe'),
    lineas: data.propuestas.length,
    urgentes,
    insumosReposicion: new Set(data.propuestas.map((r) => r.insumoId)).size,
    insumosTotales: data.insumos.length,
  }
}

export function filtrarPropuestas(propuestas, { proveedor, insumo, tipo }) {
  return propuestas.filter((r) =>
    (!proveedor || String(r.proveedorId) === proveedor) &&
    (!insumo || String(r.insumoId) === insumo) &&
    (!tipo || r.tipo === tipo))
}

export function importePorProveedor(filas) {
  const mapa = new Map()
  for (const r of filas) {
    const clave = r.proveedorId
    const actual = mapa.get(clave) || { proveedorId: clave, proveedor: r.proveedor || `Proveedor ${clave}`, importe: 0, lineas: 0 }
    actual.importe += r.importe
    actual.lineas += 1
    mapa.set(clave, actual)
  }
  return [...mapa.values()].sort((a, b) => b.importe - a.importe)
}

export const stockObjetivoInsumo = (propuestas, insumoId) => {
  const valores = [...new Set(propuestas.filter((r) => r.insumoId === insumoId && r.tipo === 'Programada').map((r) => r.stockObjetivo))]
  return valores.length === 1 ? valores[0] : null
}

export const compraSinRedondeo = (r) => Math.max(0, r.necesidadCobertura + r.stockObjetivo - r.saldoAntes)

const escaparCsv = (valor) => {
  const texto = valor == null ? '' : String(valor)
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export const CSV_COLUMNAS = ['FechaRecepcionPropuesta', 'Insumo', 'Unidad', 'Cantidad', 'ProveedorPropuesto', 'TipoPropuesta',
  'CoberturaHasta', 'CoberturaTruncada', 'SaldoAntes', 'NecesidadCobertura', 'StockObjetivo', 'ImporteEstimado']

export function propuestasACsv(filas) {
  const lineas = filas.map((r) => [r.fecha, r.insumo, r.unidad, r.cantidad, r.proveedor, r.tipo, r.coberturaHasta,
    r.coberturaTruncada ? 'Sí' : 'No', r.saldoAntes, r.necesidadCobertura, r.stockObjetivo, r.importe].map(escaparCsv).join(','))
  return [CSV_COLUMNAS.join(','), ...lineas].join('\r\n')
}

export function descargarCsv(nombre, contenido) {
  const blob = new Blob(['\ufeff', contenido], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function esPanelValido(d) {
  return Boolean(d && d.meta && d.meta.periodo && ['productos', 'insumos', 'pronostico', 'necesidades', 'propuestas', 'saldos']
    .every((k) => Array.isArray(d[k])) && d.metricas && d.metricas.prueba)
}
