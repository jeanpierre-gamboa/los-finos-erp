export const IGV_RATE = 0.18

export const productos = [
  { id: 'prod-lomo-saltado', nombre: 'Lomo saltado', categoria: 'Platos de fondo', unidad: 'plato', receta: [{ insumo: 'Lomo de res', cantidad: 0.2, unidad: 'kg' }, { insumo: 'Papa amarilla', cantidad: 0.18, unidad: 'kg' }] },
  { id: 'prod-ceviche-clasico', nombre: 'Ceviche clásico', categoria: 'Entradas', unidad: 'plato', receta: [{ insumo: 'Pescado blanco', cantidad: 0.16, unidad: 'kg' }, { insumo: 'Limón', cantidad: 0.12, unidad: 'kg' }] },
  { id: 'prod-chicha-morada', nombre: 'Chicha morada', categoria: 'Bebidas', unidad: 'vaso', receta: [{ insumo: 'Maíz morado', cantidad: 0.04, unidad: 'kg' }, { insumo: 'Azúcar', cantidad: 0.02, unidad: 'kg' }] },
  { id: 'prod-alfajor-casa', nombre: 'Alfajor de la casa', categoria: 'Postres', unidad: 'unidad', receta: [{ insumo: 'Harina', cantidad: 0.04, unidad: 'kg' }, { insumo: 'Manjar blanco', cantidad: 0.02, unidad: 'kg' }] },
]

export const preciosPorCanal = {
  salon: {
    'prod-lomo-saltado': 32,
    'prod-ceviche-clasico': 28,
    'prod-chicha-morada': 8,
    'prod-alfajor-casa': 9,
  },
  whatsapp: {
    'prod-lomo-saltado': 32,
    'prod-ceviche-clasico': 28,
    'prod-chicha-morada': 8,
    'prod-alfajor-casa': 9,
  },
  llamafood: {
    'prod-lomo-saltado': 35,
    'prod-ceviche-clasico': 31,
    'prod-chicha-morada': 9,
    'prod-alfajor-casa': 10,
  },
}

export const pedidosFacturados = [
  {
    id: 'pedido-0105', pedidoId: 'pedido-0105', serie: 'B001', correlativo: 201, numero: 'B001-000201', fecha: '2026-10-01', canal: 'salon', tipo: 'Boleta', estadoCpe: 'Aceptado',
    lineas: [{ productoId: 'prod-lomo-saltado', productoNombre: 'Lomo saltado', cantidad: 2.5, precioUnitario: 32 }], subtotal: 80, igv: 14.4, total: 94.4,
  },
  {
    id: 'pedido-0106', pedidoId: 'pedido-0106', serie: 'F001', correlativo: 45, numero: 'F001-000045', fecha: '2026-10-01', canal: 'salon', tipo: 'Factura', ruc: '20123456789', razonSocial: 'Cliente demo SAC', direccion: 'Av. Los Finos 123', estadoCpe: 'Pendiente',
    lineas: [{ productoId: 'prod-ceviche-clasico', productoNombre: 'Ceviche clásico', cantidad: 100 / 28, precioUnitario: 28 }], subtotal: 100, igv: 18, total: 118,
  },
  {
    id: 'pedido-0107', pedidoId: 'pedido-0107', serie: 'B001', correlativo: 202, numero: 'B001-000202', fecha: '2026-10-01', canal: 'llamafood', tipo: 'Boleta', estadoCpe: 'Rechazado',
    lineas: [{ productoId: 'prod-chicha-morada', productoNombre: 'Chicha morada', cantidad: 2, precioUnitario: 8 }], subtotal: 16, igv: 2.88, total: 18.88,
  },
]

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString()

export const pedidosDemo = [
  { id: 'pedido-0101', numero: 'PED-0101', correlativo: 101, canal: 'salon', mesa: '4', lineas: [{ productoId: 'prod-lomo-saltado', productoNombre: 'Lomo saltado', cantidad: 1, precioUnitario: 32 }], subtotal: 32, igv: 5.76, total: 37.76, estado: 'Confirmado', creadoEn: minutesAgo(2), incidencia: null },
  { id: 'pedido-0102', numero: 'PED-0102', correlativo: 102, canal: 'whatsapp', mesa: '', lineas: [{ productoId: 'prod-ceviche-clasico', productoNombre: 'Ceviche clásico', cantidad: 1, precioUnitario: 28 }], subtotal: 28, igv: 5.04, total: 33.04, estado: 'Confirmado', creadoEn: minutesAgo(10), incidencia: { tipo: 'retraso', detalle: 'Cliente reporta demora.', registradaEn: minutesAgo(1) } },
  { id: 'pedido-0103', numero: 'PED-0103', correlativo: 103, canal: 'llamafood', mesa: '', lineas: [{ productoId: 'prod-chicha-morada', productoNombre: 'Chicha morada', cantidad: 1, precioUnitario: 8 }], subtotal: 8, igv: 1.44, total: 9.44, estado: 'En preparación', creadoEn: minutesAgo(8), incidencia: null },
  { id: 'pedido-0104', numero: 'PED-0104', correlativo: 104, canal: 'salon', mesa: '8', lineas: [{ productoId: 'prod-lomo-saltado', productoNombre: 'Lomo saltado', cantidad: 1, precioUnitario: 32 }], subtotal: 32, igv: 5.76, total: 37.76, estado: 'Atendido', creadoEn: minutesAgo(15), incidencia: null },
]

export const comandasDemo = [
  { id: 'comanda-0103', pedidoId: 'pedido-0103', numero: 'COM-0103', estado: 'Pendiente', lineas: pedidosDemo[2].lineas, creadoEn: pedidosDemo[2].creadoEn, bajaReceta: [] },
  { id: 'comanda-0104', pedidoId: 'pedido-0104', numero: 'COM-0104', estado: 'Atendido', lineas: pedidosDemo[3].lineas, creadoEn: pedidosDemo[3].creadoEn, bajaReceta: [{ insumo: 'Lomo de res', cantidad: 0.2, unidad: 'kg' }, { insumo: 'Papa amarilla', cantidad: 0.18, unidad: 'kg' }] },
]

export const comprobantesDemo = pedidosFacturados.map((factura) => ({ ...factura, base: factura.subtotal }))

export function calcularIGV(base, tasa = IGV_RATE) {
  return Number((Number(base) * tasa).toFixed(2))
}

export function calcularTotalConIGV(base, tasa = IGV_RATE) {
  return Number((Number(base) + calcularIGV(base, tasa)).toFixed(2))
}

export function formatearNumeroDocumento(serie, correlativo, digitos = 6) {
  return `${String(serie).trim().toUpperCase()}-${String(correlativo).padStart(digitos, '0')}`
}

export function siguienteCorrelativo(documentos, serie) {
  const ultimo = documentos
    .filter((documento) => documento.serie === serie)
    .reduce((maximo, documento) => Math.max(maximo, Number(documento.correlativo) || 0), 0)
  return ultimo + 1
}