import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'

import { AppShell } from '@/layouts/AppShell'
import { useAuth } from '@/hooks/useAuth'
import { DashboardPage } from '@/pages/DashboardPage'
import { LoginPage } from '@/pages/LoginPage'
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
        <Route
          path="/sales"
          element={<PlaceholderPage title="Sales" message="No sales recorded yet. Recording sales will appear here." />}
        />
        <Route
          path="/purchases"
          element={<PlaceholderPage title="Purchases" message="No purchases found. Record your first purchase to see it here." />}
        />
        <Route
          path="/inventory"
          element={<PlaceholderPage title="Inventory" message="No inventory items yet. Add items in the Inventory section." />}
        />
        <Route
          path="/wastage"
          element={<PlaceholderPage title="Wastage" message="No wastage recorded for this period." />}
        />
        <Route
          path="/expenses"
          element={<PlaceholderPage title="Expenses" message="No expenses recorded for this period." />}
        />
        <Route
          path="/reports"
          element={<PlaceholderPage title="Reports" message="Reports will be available once transactions are recorded." />}
        />
        <Route
          path="/settings"
          element={<PlaceholderPage title="Settings" message="Settings will appear here." />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
