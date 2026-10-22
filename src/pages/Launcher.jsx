import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthContext.jsx'

const MODULES = [
  { key: 'ventas', label: 'Comercial', roles: ['gerente', 'caja', 'mozo'] },
  { key: 'cocina', label: 'Cocina', roles: ['gerente', 'cocina'] },
  { key: 'compras', label: 'Compras', roles: ['gerente', 'almacen'] },
  { key: 'almacenes', label: 'Almacenes', roles: ['gerente', 'almacen'] },
  { key: 'caja', label: 'Caja', roles: ['gerente', 'caja'] },
  { key: 'gerencia', label: 'Gerencia', roles: ['gerente'] },
]

function Launcher() {
  const navigate = useNavigate()
  const { user, role, logout } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const visibleModules = MODULES.filter((module) => module.roles.includes(role))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="launcher-shell">
      <header className="launcher-header">
        <div>
          <p className="eyebrow">Panel de acceso</p>
          <h1>Los Finos ERP</h1>
        </div>
        <button className="logout-button" type="button" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </header>

      <div className="launcher-grid">
        {visibleModules.map((module) => (
          <button
            key={module.key}
            type="button"
            className="module-card"
            onClick={() => navigate(module.key === 'comercial' ? '/comercial' : `/app/${module.key}`)}
          >
            <span className="module-icon">{module.label.slice(0, 2).toUpperCase()}</span>
            <span className="module-name">{module.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default Launcher
