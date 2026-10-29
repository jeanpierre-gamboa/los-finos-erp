import { Link } from 'react-router-dom'
import { useAuth } from '../../../app/AuthContext.jsx'
import { Notice, Panel, SinDatos } from '../components.jsx'
import { canAccessSection, findSection, sectionHref } from '../access.js'

const STAGES = [
  { id: 'planificacion', step: '1', name: 'Planificación', text: 'Pronóstico de demanda y necesidades de insumos.', indicator: 'Necesidades calculadas' },
  { id: 'solicitudes', step: '2', name: 'Solicitud', text: 'Solicitud interna de insumos y su aprobación.', indicator: 'Solicitudes pendientes de aprobación' },
  { id: 'compras', step: '3', name: 'Compra', text: 'Cotizaciones y órdenes de compra al proveedor.', indicator: 'Órdenes abiertas' },
  { id: 'recepcion', step: '4', name: 'Recepción', text: 'Verificación de lo entregado por el proveedor.', indicator: 'Recepciones por confirmar' },
  { id: 'inventarios', step: '5', name: 'Inventario', text: 'Existencias y kardex de insumos.', indicator: 'Insumos bajo el mínimo' },
]

function Resumen() {
  const { role } = useAuth()

  return (
    <>
      <Panel title="Etapas del abastecimiento">
        <div className="lg-grid">
          {STAGES.map((stage) => {
            const section = findSection(stage.id)
            const allowed = canAccessSection(section, role)
            const body = (
              <>
                <span className="lg-stage-step">Etapa {stage.step}</span>
                <strong>{stage.name}</strong>
                <p>{stage.text}</p>
                <div className="lg-stage-indicator">{stage.indicator}: <SinDatos /></div>
                {allowed ? null : <small>Disponible solo para Gerencia.</small>}
              </>
            )
            return allowed
              ? <Link key={stage.id} to={sectionHref(section)} className="lg-stage">{body}</Link>
              : <div key={stage.id} className="lg-stage is-locked" aria-disabled="true">{body}</div>
          })}
        </div>
      </Panel>
      <Notice>
        El pedido del cliente, la solicitud interna de insumos y la orden de compra al proveedor son documentos distintos.
        Aprobar una solicitud o emitir una orden no modifica el stock: solo la recepción confirmada registrará entradas de inventario.
        Los indicadores se mostrarán cuando existan datos integrados.
      </Notice>
    </>
  )
}

export default Resumen
