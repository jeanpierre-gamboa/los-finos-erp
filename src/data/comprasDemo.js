export const proveedores = [
  { id: 'prov-avicola', nombre: 'Avícola San Martín', rubro: 'pollo' },
  { id: 'prov-carnes', nombre: 'Carnes Premium SAC', rubro: 'carnes' },
  { id: 'prov-granero', nombre: 'Distribuidora El Granero', rubro: 'secos' },
]

export const insumos = [
  { id: 'ins-pollo-entero', nombre: 'Pollo entero', unidad: 'kg', stockMin: 20, ultimoPrecio: 13.9, ultimoProveedorId: 'prov-avicola' },
  { id: 'ins-asado-tira', nombre: 'Asado de tira', unidad: 'kg', stockMin: 15, ultimoPrecio: 38, ultimoProveedorId: 'prov-carnes' },
  { id: 'ins-arroz-extra', nombre: 'Arroz extra', unidad: 'kg', stockMin: 30, ultimoPrecio: 4.8, ultimoProveedorId: 'prov-granero' },
  { id: 'ins-aceite-vegetal', nombre: 'Aceite vegetal', unidad: 'l', stockMin: 12, ultimoPrecio: 5.4, ultimoProveedorId: 'prov-granero' },
]

export const ordenes = [
  {
    id: 'orden-001', numero: 'OC-2026-001', proveedorId: 'prov-avicola', proveedorNombre: 'Avícola San Martín', tipoCalendario: 'Diario · pollo', estado: 'Por recibir', fecha: '2026-09-01',
    lineas: [{ id: 'linea-001', insumoId: 'ins-pollo-entero', insumoNombre: 'Pollo entero', cantidad: 35, unidad: 'kg', precioUnitario: 13.9 }], total: 486.5,
  },
  {
    id: 'orden-002', numero: 'OC-2026-002', proveedorId: 'prov-carnes', proveedorNombre: 'Carnes Premium SAC', tipoCalendario: '3x semana · carnes', estado: 'Autorizada', fecha: '2026-09-02',
    lineas: [{ id: 'linea-002', insumoId: 'ins-asado-tira', insumoNombre: 'Asado de tira', cantidad: 24, unidad: 'kg', precioUnitario: 38 }], total: 912,
  },
  {
    id: 'orden-003', numero: 'OC-2026-003', proveedorId: 'prov-granero', proveedorNombre: 'Distribuidora El Granero', tipoCalendario: 'Quincenal · secos', estado: 'Autorizada', fecha: '2026-09-03',
    lineas: [
      { id: 'linea-003', insumoId: 'ins-arroz-extra', insumoNombre: 'Arroz extra', cantidad: 50, unidad: 'kg', precioUnitario: 4.8 },
      { id: 'linea-004', insumoId: 'ins-aceite-vegetal', insumoNombre: 'Aceite vegetal', cantidad: 25, unidad: 'l', precioUnitario: 5.4 },
    ], total: 375,
  },
]