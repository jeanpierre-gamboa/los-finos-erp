import { useState } from 'react'
import { DataTable, Notice, Panel, Tabs } from '../components.jsx'

const TABS = [
  { id: 'existencias', label: 'Existencias' },
  { id: 'kardex', label: 'Kardex' },
]

function Inventarios() {
  const [tab, setTab] = useState('existencias')

  return (
    <>
      <Notice>Las consultas de existencias y kardex aún no están integradas.</Notice>
      <Tabs label="Inventarios" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'existencias' ? (
        <Panel title="Existencias">
          <DataTable label="Existencias" columns={['Insumo', 'Unidad', 'Stock actual', 'Stock mínimo']} emptyText="Sin datos de existencias." />
        </Panel>
      ) : (
        <Panel title="Kardex">
          <DataTable label="Kardex" columns={['Fecha', 'Movimiento', 'Documento', 'Entrada', 'Salida', 'Costo unitario', 'Saldo']} emptyText="Sin movimientos para mostrar." />
        </Panel>
      )}
    </>
  )
}

export default Inventarios
