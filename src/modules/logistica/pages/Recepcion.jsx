import { DataTable, Notice, Panel, PendingAction } from '../components.jsx'

function Recepcion() {
  return (
    <>
      <Notice>
        La recepción confirmada será la que registre las entradas de inventario. Esta pantalla aún no confirma recepciones ni modifica el stock.
      </Notice>
      <Panel title="Recepción contra orden de compra">
        <DataTable
          label="Recepción de mercadería"
          columns={['Orden', 'Proveedor', 'Guía', 'Insumo', 'Unidad', 'Cant. pedida', 'Cant. recibida', 'Cant. aceptada', 'Observaciones']}
          emptyText="No hay órdenes pendientes de recepción."
        />
        <br />
        <PendingAction id="lg-rec-confirmar" reason="Pendiente de integración: no se puede confirmar ni registrar entradas.">
          Confirmar recepción
        </PendingAction>
      </Panel>
    </>
  )
}

export default Recepcion
