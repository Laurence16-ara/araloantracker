import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase.js'
import NotConfigured from './pages/NotConfigured.jsx'
import Apply from './pages/Apply.jsx'
import Sign from './pages/Sign.jsx'
const AdminLayout = lazy(() => import('./components/AdminLayout.jsx'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'))
const Applications = lazy(() => import('./pages/admin/Applications.jsx'))
const Records = lazy(() => import('./pages/admin/Records.jsx'))
const LoanDetail = lazy(() => import('./pages/admin/LoanDetail.jsx'))
const Clients = lazy(() => import('./pages/admin/Clients.jsx'))
const ClientDetail = lazy(() => import('./pages/admin/ClientDetail.jsx'))
const Reports = lazy(() => import('./pages/admin/Reports.jsx'))
const Settings = lazy(() => import('./pages/admin/Settings.jsx'))

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <Suspense fallback={null}>
    <Routes>
      <Route path="/" element={<Navigate to="/apply" replace />} />
      <Route path="/apply" element={<Apply />} />
      <Route path="/sign/:token" element={<Sign />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="applications" element={<Applications />} />
        <Route path="records" element={<Records />} />
        <Route path="loans/:id" element={<LoanDetail />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/apply" replace />} />
    </Routes>
    </Suspense>
  )
}
