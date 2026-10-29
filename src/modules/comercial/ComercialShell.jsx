import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AuthContext.jsx'
import './comercial-shell.css'

const NAV_ITEMS = [
  { to: '/app/ventas', label: 'Cola de pedidos', roles: ['gerente', 'mozo', 'caja'] },
  { to: '/app/ventas/nuevo', label: 'Nuevo pedido', roles: ['gerente', 'mozo', 'caja'] },
  { to: '/app/ventas/cobro', label: 'Cobro', roles: ['gerente', 'mozo', 'caja'] },
  { to: '/app/ventas/periodo', label: 'Ventas del período', roles: ['gerente', 'mozo', 'caja'] },
  { to: '/app/cocina', label: 'Cocina', roles: ['gerente', 'cocina'] },
]

function ComercialShell({ children }) {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="cm-shell">
      <aside className="cm-sidebar">
        <div className="cm-sidebar-top">
          <div className="cm-brand">
            <div className="brand-mark" aria-hidden="true">LF</div>
            <div>
              <strong>Los Finos</strong>
              <small>Comercial</small>
            </div>
          </div>
          <button type="button" className="cm-menu-toggle" aria-expanded={menuOpen} aria-controls="cm-nav" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? 'Cerrar menú' : 'Menú'}
          </button>
        </div>
        <nav id="cm-nav" className={`cm-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Secciones de Comercial">
          {NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => (
            <NavLink key={item.to} to={item.to} end onClick={() => setMenuOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="cm-content">
        <header className="cm-topbar">
          <div className="cm-user">
            <span>{user}</span>
            <small>{role}</small>
          </div>
          <button type="button" className="cm-btn-ghost" onClick={() => navigate('/apps')}>Volver al panel</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export default ComercialShell
