import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../app/AuthContext.jsx'

const MODULE_LABELS = {
  ventas: 'Ventas',
  cocina: 'Cocina',
  caja: 'Caja',
  gerencia: 'Gerencia',
}

const ROLE_ACCESS = {
  gerente: ['ventas', 'cocina', 'caja', 'gerencia'],
  caja: ['ventas', 'caja'],
  mozo: ['ventas'],
  almacen: [],
  cocina: ['cocina'],
}

function ModuleShell() {
  const { modulo } = useParams()
  const navigate = useNavigate()
  const { user, role } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const moduleKey = String(modulo || '').toLowerCase()
  const moduleLabel = MODULE_LABELS[moduleKey]
  const allowedModules = ROLE_ACCESS[role] || []

  if (!moduleLabel || !allowedModules.includes(moduleKey)) {
    return <Navigate to="/apps" replace />
  }

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="brand-group">
          <div className="brand-mark">LF</div>
          <span>Los Finos</span>
        </div>

        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => navigate('/apps')}>
            Volver a apps
          </button>

          <div className="user-meta">
            <span>{user}</span>
            <small>{role}</small>
          </div>
        </div>
      </header>

      <main className="module-main">
        <div className="module-panel">
          <p className="module-kicker">Cáscarón — {moduleLabel}. Funcionalidades la próxima semana.</p>
        </div>
      </main>
    </div>
  )
}

export default ModuleShell
