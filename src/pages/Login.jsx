import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthContext.jsx'

function Login() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [email, setEmail] = useState('gerente@losfinos.pe')
  const [password, setPassword] = useState('123456')
  const [error, setError] = useState('')

  if (user) {
    return <Navigate to="/apps" replace />
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const ok = login(email.trim(), password)

    if (!ok) {
      setError('Usuario o contraseña incorrectos.')
      return
    }

    setError('')
    navigate('/apps', { replace: true })
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand-block">
          <div className="brand-mark">LF</div>
          <h1>Los Finos ERP</h1>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="input-row">
            <span>Usuario</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="usuario@losfinos.pe"
              autoComplete="username"
            />
          </label>

          <label className="input-row">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
            />
          </label>

          {error ? <div className="error-message">{error}</div> : null}

          <button type="submit" className="login-button">
            Ingresar
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
