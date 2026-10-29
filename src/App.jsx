import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './app/AuthContext.jsx'
import Login from './pages/Login.jsx'
import Launcher from './pages/Launcher.jsx'
import ModuleShell from './pages/ModuleShell.jsx'
import './App.css'
import Comercial from './pages/Comercial.jsx'
import { ComercialProvider } from './modules/comercial/ComercialContext.jsx'
import LogisticaLayout from './modules/logistica/LogisticaLayout.jsx'
import Resumen from './modules/logistica/pages/Resumen.jsx'
import Planificacion from './modules/logistica/pages/Planificacion.jsx'
import Solicitudes from './modules/logistica/pages/Solicitudes.jsx'
import Compras from './modules/logistica/pages/Compras.jsx'
import Recepcion from './modules/logistica/pages/Recepcion.jsx'
import Inventarios from './modules/logistica/pages/Inventarios.jsx'
import Control from './modules/logistica/pages/Control.jsx'
import Catalogos from './modules/logistica/pages/Catalogos.jsx'

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/apps"
        element={user ? <Launcher /> : <Navigate to="/login" replace />}
      />
      <Route path="/app/logistica" element={<LogisticaLayout />}>
        <Route index element={<Resumen />} />
        <Route path="planificacion" element={<Planificacion />} />
        <Route path="solicitudes" element={<Solicitudes />} />
        <Route path="compras" element={<Compras />} />
        <Route path="recepcion" element={<Recepcion />} />
        <Route path="inventarios" element={<Inventarios />} />
        <Route path="control" element={<Control />} />
        <Route path="catalogos" element={<Catalogos />} />
        <Route path="*" element={<Navigate to="/app/logistica" replace />} />
      </Route>
      <Route path="/app/compras/*" element={<Navigate to="/app/logistica/compras" replace />} />
      <Route path="/app/almacenes/*" element={<Navigate to="/app/logistica/inventarios" replace />} />
      <Route
        path="/app/ventas"
        element={user ? <Comercial /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/ventas/nuevo"
        element={user ? <Comercial view="new" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/ventas/cobro"
        element={user ? <Comercial view="cobro" /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/ventas/periodo"
        element={user ? <Comercial view="periodo" /> : <Navigate to="/login" replace />}
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
        <ComercialProvider>
          <AppRoutes />
        </ComercialProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
