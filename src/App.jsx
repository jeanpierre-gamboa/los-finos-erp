import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './app/AuthContext.jsx'
import Login from './pages/Login.jsx'
import Launcher from './pages/Launcher.jsx'
import ModuleShell from './pages/ModuleShell.jsx'
import Compras from './pages/Compras.jsx'
import './App.css'
import { ComprasProvider } from './modules/compras/ComprasContext.jsx'
import Comercial from './pages/Comercial.jsx'
import { ComercialProvider } from './modules/comercial/ComercialContext.jsx'

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/apps"
        element={user ? <Launcher /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/compras/nueva"
        element={user ? <Compras view="new" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/compras"
        element={user ? <Compras view="list" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/compras/:orderId"
        element={user ? <Compras view="list" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/ventas"
        element={user ? <Comercial /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/cocina"
        element={user ? <Comercial view="cocina" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/:modulo"
        element={user ? <ModuleShell /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={user ? '/apps' : '/login'} replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ComprasProvider>
          <ComercialProvider>
            <AppRoutes />
          </ComercialProvider>
        </ComprasProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
