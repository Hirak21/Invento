import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { Select } from '@/components/ui/Select'
import { useAuth } from '@/hooks/useAuth'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listBusinessUnits } from '@/services/masterData'
import type { BusinessUnit } from '@/types/master'
import { cn } from '@/utils/cn'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/sales', label: 'Sales' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/purchases', label: 'Purchases' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/stock-alerts', label: 'Stock Alerts' },
  { to: '/wastage', label: 'Wastage' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
] as const

/** Bottom-nav shows at most these five; everything else lives in "More". */
const PRIMARY_PATHS = new Set(['/dashboard', '/rooms', '/sales', '/inventory'])
const MORE_PATHS = new Set([
  '/purchases',
  '/recipes',
  '/stock-alerts',
  '/wastage',
  '/expenses',
  '/reports',
  '/settings',
])

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
              'min-h-[44px] rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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

function UnitSelector({ className }: { className?: string }) {
  const { selectedBuId, setSelectedBuId } = useBusinessUnit()
  const [units, setUnits] = useState<BusinessUnit[]>([])

  useEffect(() => {
    void listBusinessUnits()
      .then(setUnits)
      .catch(() => undefined)
  }, [])

  return (
    <div className={cn('min-w-[9rem]', className)}>
      <Select
        label=""
        value={selectedBuId ?? ''}
        onChange={(e) => setSelectedBuId(e.target.value || null)}
        className="!py-1.5 text-sm"
        aria-label="Current business unit"
      >
        <option value="">All units</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)

  const primaryItems = NAV_ITEMS.filter((item) => PRIMARY_PATHS.has(item.to))
  const moreItems = NAV_ITEMS.filter((item) => MORE_PATHS.has(item.to))

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-slate-900/40"
            aria-hidden="true"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+4.5rem)]">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <span className="text-sm font-semibold text-slate-900">More</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMoreOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-lg p-3 text-slate-500 hover:bg-slate-100"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 p-3">
              {moreItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 text-center text-xs font-medium',
                      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-5">
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium',
                isActive ? 'text-indigo-700' : 'text-slate-500',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex min-h-[56px] flex-col items-center justify-center px-1 py-2 text-[11px] font-medium text-slate-500"
        >
          More
        </button>
      </div>
    </nav>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const { setSelectedBuId } = useBusinessUnit()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  function handleLogout() {
    logout()
    setSelectedBuId(null)
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh">
      {/* Mobile top bar: unit switcher is always visible, 1 tap to switch */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5 md:hidden">
        <span className="shrink-0 text-sm font-bold text-indigo-700">Invento</span>
        <UnitSelector className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={handleLogout}
          className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Log out
        </button>
      </header>

      {/* Mobile drawer (desktop-style full list, opened from More sheet is primary path) */}
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
          <header className="hidden items-center justify-between gap-3 border-b border-slate-200 bg-white px-8 py-3 md:flex">
            <UnitSelector className="w-48" />
            <span className="text-sm font-medium text-slate-700">{user?.username}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Log out
            </button>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 pb-20 md:px-8 md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
