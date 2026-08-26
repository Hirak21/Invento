import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'

import { AppShell } from '@/layouts/AppShell'
import { useAuth } from '@/hooks/useAuth'
import { DashboardPage } from '@/pages/DashboardPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { LoginPage } from '@/pages/LoginPage'
import { PurchasesPage } from '@/pages/PurchasesPage'
import { SalesPage } from '@/pages/SalesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { WastagePage } from '@/pages/WastagePage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="size-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/sales"
          element={<SalesPage />}
        />
        <Route
          path="/wastage"
          element={<WastagePage />}
        />
        <Route
          path="/expenses"
          element={<PlaceholderPage title="Expenses" message="No expenses recorded for this period." />}
        />
        <Route
          path="/reports"
          element={<PlaceholderPage title="Reports" message="Reports will be available once transactions are recorded." />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
