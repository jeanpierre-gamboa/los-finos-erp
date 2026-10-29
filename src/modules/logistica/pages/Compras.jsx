import { useState } from 'react'
import { DataTable, Notice, Panel, PendingAction, Tabs } from '../components.jsx'

const TABS = [
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'ordenes', label: 'Órdenes de compra' },
]

function Cotizaciones() {
  return (
    <>
      <Panel title="Cotizaciones">
        <DataTable label="Cotizaciones" columns={['Proveedor', 'Insumos', 'Cantidades', 'Precios', 'Plazo de entrega', 'Condiciones']} emptyText="No hay cotizaciones registradas." />
        <br />
        <PendingAction id="lg-cot-nueva" reason="Pendiente de integración: aún no se pueden registrar cotizaciones.">Nueva cotización</PendingAction>
      </Panel>
      <Panel title="Comparación de cotizaciones" description="Espacio para contrastar hasta tres cotizaciones de un mismo requerimiento.">
        <div className="lg-compare">
          {['A', 'B', 'C'].map((slot) => (
            <div className="lg-slot" key={slot}>
              <h3>Cotización {slot}</h3>
              <dl>
                <dt>Proveedor</dt><dd>—</dd>
                <dt>Precio total</dt><dd>—</dd>
                <dt>Plazo</dt><dd>—</dd>
                <dt>Condiciones</dt><dd>—</dd>
              </dl>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}

function Ordenes() {
  return (
    <>
      <Panel title="Órdenes de compra">
        <DataTable label="Órdenes de compra" columns={['Número', 'Proveedor', 'Solicitud relacionada', 'Fecha', 'Estado', 'Total']} emptyText="No hay órdenes de compra registradas." />
        <br />
        <PendingAction id="lg-oc-nueva" reason="Pendiente de integración: aún no se pueden emitir órdenes.">Nueva orden de compra</PendingAction>
      </Panel>
      <Panel title="Detalle de orden" description="Se mostrará al seleccionar una orden del listado.">
        <DataTable label="Detalle de la orden" columns={['Insumo', 'Unidad', 'Cantidad', 'Precio unitario', 'Subtotal']} emptyText="Sin orden seleccionada." />
      </Panel>
    </>
  )
}

function Compras() {
  const [tab, setTab] = useState('cotizaciones')

  return (
    <>
      <Notice>
        Emitir una orden no modifica el stock: la entrada de inventario la registrará la recepción confirmada.
        Las compras ya recibidas que existan en la base de datos no se interpretan como órdenes pendientes.
      </Notice>
      <Tabs label="Compras" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'cotizaciones' ? <Cotizaciones /> : <Ordenes />}
    </>
  )
}

export default Compras
