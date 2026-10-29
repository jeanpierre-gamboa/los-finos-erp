export const LOGISTICA_BASE = '/app/logistica'

const GERENTE = ['gerente']
const GERENTE_ALMACEN = ['gerente', 'almacen']

// Permisos provisionales solo de interfaz; la autorización real en backend está pendiente.
export const SECTIONS = [
  { id: 'resumen', path: '', label: 'Resumen', title: 'Resumen de abastecimiento', description: 'Vista general de las etapas del abastecimiento: planificación, solicitud, compra, recepción e inventario.', roles: GERENTE_ALMACEN },
  { id: 'planificacion', path: 'planificacion', label: 'Planificación', title: 'Planificación de demanda', description: 'Pronóstico de demanda, necesidades de insumos y propuesta de abastecimiento a partir de resultados guardados (solo consulta).', roles: GERENTE },
  { id: 'solicitudes', path: 'solicitudes', label: 'Solicitudes de pedido', title: 'Solicitudes de pedido', description: 'Solicitudes internas de insumos, con su origen, estado y aprobación.', roles: GERENTE_ALMACEN },
  { id: 'compras', path: 'compras', label: 'Compras', title: 'Compras', description: 'Cotizaciones de proveedores y órdenes de compra.', roles: GERENTE_ALMACEN },
  { id: 'recepcion', path: 'recepcion', label: 'Recepción', title: 'Recepción de mercadería', description: 'Contraste entre lo ordenado, lo recibido y lo aceptado.', roles: GERENTE_ALMACEN },
  { id: 'inventarios', path: 'inventarios', label: 'Inventarios y kardex', title: 'Inventarios y kardex', description: 'Existencias de insumos y movimientos de inventario.', roles: GERENTE_ALMACEN },
  { id: 'control', path: 'control', label: 'Control de gestión', title: 'Control de gestión', description: 'Indicadores de demanda, abastecimiento e inventario.', roles: GERENTE },
  { id: 'catalogos', path: 'catalogos', label: 'Catálogos', title: 'Catálogos', description: 'Insumos, proveedores, unidades y recetas.', roles: GERENTE_ALMACEN },
]

export const canAccessLogistica = (role) => GERENTE_ALMACEN.includes(role)
export const canAccessSection = (section, role) => section.roles.includes(role)
export const sectionHref = (section) => (section.path ? `${LOGISTICA_BASE}/${section.path}` : LOGISTICA_BASE)
export const findSection = (id) => SECTIONS.find((section) => section.id === id)
