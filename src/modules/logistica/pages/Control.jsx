import { Notice, Panel, SinDatos } from '../components.jsx'

const AREAS = [
  { title: 'Demanda', measures: ['Exactitud del pronóstico frente a las ventas reales', 'Evolución de la demanda por producto'] },
  { title: 'Abastecimiento', measures: ['Cumplimiento de plazos de entrega del proveedor', 'Diferencias entre lo ordenado y lo aceptado', 'Tiempo entre solicitud, orden y recepción'] },
  { title: 'Inventario', measures: ['Insumos bajo el stock mínimo', 'Rotación y cobertura de insumos', 'Mermas y ajustes de inventario'] },
]

function Control() {
  return (
    <>
      <Notice>Los indicadores se calcularán cuando existan datos integrados. No se muestran resultados ni gráficos de ejemplo.</Notice>
      <div className="lg-grid">
        {AREAS.map((area) => (
          <Panel key={area.title} title={area.title}>
            <div className="lg-metric">
              <h3>Qué mediría</h3>
              <ul>{area.measures.map((measure) => <li key={measure}>{measure}</li>)}</ul>
              <SinDatos />
            </div>
          </Panel>
        ))}
      </div>
    </>
  )
}

export default Control
