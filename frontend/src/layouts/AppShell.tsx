import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'

import { Select } from '@/components/ui/Select'
import { useAuth } from '@/hooks/useAuth'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listBusinessUnits } from '@/services/masterData'
import type { BusinessUnit } from '@/types/master'
import { cn } from '@/utils/cn'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/sales', label: 'Sales' },
  { to: '/purchases', label: 'Purchases' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/wastage', label: 'Wastage' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
] as const

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const { selectedBuId, setSelectedBuId } = useBusinessUnit()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [units, setUnits] = useState<BusinessUnit[]>([])

  useEffect(() => {
    void listBusinessUnits()
      .then(setUnits)
      .catch(() => undefined)
  }, [])

  function handleLogout() {
    logout()
    setSelectedBuId(null)
    navigate('/login', { replace: true })
  }

  const unitSelector = (
    <Select
      label=""
      value={selectedBuId ?? ''}
      onChange={(e) => setSelectedBuId(e.target.value || null)}
      className="!py-1.5 text-sm"
      aria-label="Filter by business unit"
    >
      <option value="">All units</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </Select>
  )

  const isDashboard = location.pathname === '/dashboard'
  const isSettings = location.pathname === '/settings'

  return (
    <div className="min-h-dvh">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {drawerOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
        <span className="text-sm font-semibold text-slate-900">Invento Lite</span>
        {isDashboard ? (
          <div className="w-40">{unitSelector}</div>
        ) : isSettings ? (
          <UserMenuButton username={user?.username ?? ''} onLogout={handleLogout} compact />
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-40">{unitSelector}</div>
            <UserMenuButton username={user?.username ?? ''} onLogout={handleLogout} compact />
          </div>
        )}
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-200 px-5 py-4 text-lg font-bold text-indigo-700">
              Invento Lite
            </div>
            <NavList onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="md:flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="border-b border-slate-200 px-5 py-5 text-xl font-bold text-indigo-700">
            Invento Lite
          </div>
          <NavList />
        </aside>

        {/* Main area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop topbar */}
          <header className="hidden items-center justify-between border-b border-slate-200 bg-white px-8 py-3 md:flex">
            {isDashboard ? (
              <div className="w-48">{unitSelector}</div>
            ) : isSettings ? (
              <UserMenuButton username={user?.username ?? ''} onLogout={handleLogout} />
            ) : (
              <div className="flex items-center justify-between w-full">
                <div className="w-48">{unitSelector}</div>
                <UserMenuButton username={user?.username ?? ''} onLogout={handleLogout} />
              </div>
            )}
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

function UserMenuButton({
  username,
  onLogout,
  compact,
}: {
  username: string
  onLogout: () => void
  compact?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      {!compact && (
        <span className="text-sm font-medium text-slate-700">{username}</span>
      )}
      <button
        type="button"
        onClick={onLogout}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Log out
      </button>
    </div>
  )
}
