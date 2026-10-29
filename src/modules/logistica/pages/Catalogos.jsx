import { useState } from 'react'
import { DataTable, Notice, Panel, Tabs } from '../components.jsx'

const CATALOGOS = {
  insumos: { label: 'Insumos', columns: ['Código', 'Insumo', 'Unidad', 'Stock mínimo', 'Estado'] },
  proveedores: { label: 'Proveedores', columns: ['RUC', 'Proveedor', 'Contacto', 'Teléfono', 'Estado'] },
  unidades: { label: 'Unidades', columns: ['Unidad', 'Abreviatura'] },
  recetas: { label: 'Recetas', columns: ['Producto', 'Insumo', 'Unidad', 'Cantidad por unidad'] },
}
const TABS = Object.entries(CATALOGOS).map(([id, catalog]) => ({ id, label: catalog.label }))

function Catalogos() {
  const [tab, setTab] = useState('insumos')
  const catalog = CATALOGOS[tab]

  return (
    <>
      <Notice>Vista de estructura: los catálogos aún no se leen ni se modifican desde esta pantalla.</Notice>
      <Tabs label="Catálogos" tabs={TABS} active={tab} onChange={setTab} />
      <Panel title={catalog.label}>
        <DataTable label={catalog.label} columns={catalog.columns} emptyText="Sin datos: catálogo no conectado." />
      </Panel>
    </>
  )
}

export default Catalogos
