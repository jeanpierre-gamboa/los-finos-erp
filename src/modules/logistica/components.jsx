export function Panel({ title, description, children }) {
  return (
    <section className="lg-panel">
      {title ? (
        <header className="lg-panel-head">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function Notice({ children }) {
  return <p className="lg-notice" role="note">{children}</p>
}

export function SinDatos() {
  return <span className="lg-nodata">Sin datos</span>
}

export function DataTable({ label, columns, emptyText }) {
  return (
    <div className="lg-table-wrap">
      <table className="lg-table" aria-label={label}>
        <thead>
          <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
        </thead>
        <tbody>
          <tr><td className="lg-table-empty" colSpan={columns.length}>{emptyText}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

export function Tabs({ label, tabs, active, onChange }) {
  return (
    <div className="lg-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} className={active === tab.id ? 'active' : ''} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function PendingAction({ id, children, reason }) {
  return (
    <div className="lg-action">
      <button type="button" className="lg-btn" disabled aria-describedby={id}>{children}</button>
      <small id={id}>{reason}</small>
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <label className="lg-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
