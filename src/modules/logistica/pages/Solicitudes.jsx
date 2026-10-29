import { DataTable, Field, Notice, Panel, PendingAction } from '../components.jsx'

const ESTADOS = ['Borrador', 'Pendiente de aprobación', 'Aprobada', 'Rechazada', 'Cancelada']

function Solicitudes() {
  return (
    <>
      <Notice>
        Estados provisionales. El guardado y la aprobación aún no están integrados, y aprobar una solicitud no modifica el stock.
      </Notice>

      <Panel title="Listado de solicitudes">
        <div className="lg-form-row">
          <Field label="Estado">
            <select disabled defaultValue="">
              <option value="">Todos</option>
              {ESTADOS.map((estado) => <option key={estado}>{estado}</option>)}
            </select>
          </Field>
          <Field label="Origen">
            <select disabled defaultValue="">
              <option value="">Todos</option>
              <option>Manual</option>
              <option>Planificación</option>
            </select>
          </Field>
          <Field label="Fecha desde"><input type="date" disabled /></Field>
          <Field label="Fecha hasta"><input type="date" disabled /></Field>
        </div>
        <DataTable label="Solicitudes de pedido" columns={['Número', 'Fecha', 'Solicitante', 'Origen', 'Fecha requerida', 'Estado']} emptyText="No hay solicitudes registradas." />
        <br />
        <PendingAction id="lg-sol-nueva" reason="Pendiente de integración: aún no se pueden registrar solicitudes.">
          Nueva solicitud
        </PendingAction>
      </Panel>

      <Panel title="Detalle de solicitud" description="Se mostrará al seleccionar una solicitud del listado.">
        <div className="lg-form-row">
          <Field label="Número"><input disabled placeholder="—" /></Field>
          <Field label="Solicitante"><input disabled placeholder="—" /></Field>
          <Field label="Origen"><input disabled placeholder="—" /></Field>
          <Field label="Fecha requerida"><input disabled placeholder="—" /></Field>
          <Field label="Estado"><input disabled placeholder="—" /></Field>
        </div>
        <DataTable label="Insumos de la solicitud" columns={['Insumo', 'Unidad', 'Cantidad']} emptyText="Sin solicitud seleccionada." />
        <br />
        <div className="lg-actions-row">
          <PendingAction id="lg-sol-aprobar" reason="Pendiente: la aprobación requiere integración y autorización en el servidor.">Aprobar</PendingAction>
          <PendingAction id="lg-sol-rechazar" reason="Pendiente de integración.">Rechazar</PendingAction>
        </div>
      </Panel>
    </>
  )
}

export default Solicitudes
