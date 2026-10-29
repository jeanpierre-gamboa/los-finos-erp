import { useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AuthContext.jsx'
import { canAccessLogistica, canAccessSection, LOGISTICA_BASE, SECTIONS, sectionHref } from './access.js'
import './logistica.css'

function LogisticaLayout() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  if (!user) return <Navigate to="/login" replace />
  if (!canAccessLogistica(role)) return <Navigate to="/apps" replace />

  const currentPath = pathname.replace(/\/+$/, '')
  const current = SECTIONS.find((section) => sectionHref(section) === currentPath) || SECTIONS[0]
  if (!canAccessSection(current, role)) return <Navigate to={LOGISTICA_BASE} replace />

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="lg-shell">
      <aside className="lg-sidebar">
        <div className="lg-sidebar-top">
          <div className="lg-brand">
            <div className="brand-mark" aria-hidden="true">LF</div>
            <div>
              <strong>Los Finos ERP</strong>
              <small>Logística</small>
            </div>
          </div>
          <button type="button" className="lg-menu-toggle" aria-expanded={menuOpen} aria-controls="lg-nav" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? 'Cerrar menú' : 'Menú'}
          </button>
        </div>
        <nav id="lg-nav" className={`lg-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Secciones de Logística">
          {SECTIONS.filter((section) => canAccessSection(section, role)).map((section) => (
            <NavLink key={section.id} to={sectionHref(section)} end onClick={() => setMenuOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>
              {section.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg-content">
        <header className="lg-topbar">
          <div className="lg-user">
            <span>{user}</span>
            <small>{role}</small>
          </div>
          <div className="lg-topbar-actions">
            <button type="button" className="lg-btn lg-btn-ghost" onClick={() => navigate('/apps')}>Volver al panel</button>
            <button type="button" className="lg-btn lg-btn-ghost" onClick={handleLogout}>Cerrar sesión</button>
          </div>
        </header>
        <main className="lg-main">
          <div className="lg-title">
            <p className="lg-eyebrow">Logística</p>
            <h1>{current.title}</h1>
            <p>{current.description}</p>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default LogisticaLayout
