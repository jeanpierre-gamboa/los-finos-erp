import { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

const DEMO_USERS = {
  'gerente@losfinos.pe': { role: 'gerente', name: 'Gerente' },
  'caja@losfinos.pe': { role: 'caja', name: 'Caja' },
  'mozo@losfinos.pe': { role: 'mozo', name: 'Mozo' },
  'almacen@losfinos.pe': { role: 'almacen', name: 'Almacén' },
  'cocina@losfinos.pe': { role: 'cocina', name: 'Cocina' },
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)

  const login = (email, password) => {
    const account = DEMO_USERS[email]

    if (!account || password !== '123456') {
      return false
    }

    setUser(email)
    setRole(account.role)
    return true
  }

  const logout = () => {
    setUser(null)
    setRole(null)
  }

  const value = useMemo(
    () => ({
      user,
      role,
      login,
      logout,
    }),
    [user, role],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The hook shares this context module with the provider by design.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
