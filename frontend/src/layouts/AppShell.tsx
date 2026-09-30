import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { useAuth } from '@/hooks/useAuth'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { SaleFormModal } from '@/features/sales/SaleFormModal'
import { cn } from '@/utils/cn'
import {
  ArrowRightOnRectangleIcon,
  CartIcon,
  ClipboardListIcon,
  CubeTransparentIcon,
  EllipsisHorizontalIcon,
  HomeIcon,
  PlusIcon,
  XMarkIcon,
} from '@/components/icons'

/**
 * Global navigation — max 5 primary destinations on mobile.
 * Order: Home | Sales | (+) | Stock | More.
 * Rooms lives in More (routes still work); center FAB opens New Sale directly.
 */
const PRIMARY_NAV = [
  { to: '/dashboard', label: 'Home', icon: HomeIcon },
  { to: '/sales', label: 'Sales', icon: CartIcon },
  { to: '/inventory', label: 'Stock', icon: CubeTransparentIcon },
] as const

const MORE_GROUPS = [
  {
    title: 'Run the floor',
    items: [
      { to: '/rooms', label: 'Rooms' },
      { to: '/purchases', label: 'Purchases' },
      { to: '/recipes', label: 'Recipes' },
    ],
  },
  {
    title: 'Money & records',
    items: [
      { to: '/expenses', label: 'Expenses' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/stock-alerts', label: 'Stock alerts' },
      { to: '/wastage', label: 'Wastage' },
      { to: '/settings', label: 'Settings' },
    ],
  },
] as const

function NavIcon({ icon: Icon, active }: { icon: (p: { className?: string }) => React.ReactNode; active?: boolean }) {
  return (
    <span className={cn(active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]')}>
      <Icon className="w-6 h-6" />
    </span>
  )
}

/** Compact unit switcher for the slim mobile header. Uses shared context so retry re-hydrates. */
function CompactUnitSelector() {
  const { selectedBuId, setSelectedBuId, units, buStatus, buError, refreshUnits } = useBusinessUnit()

  if (buStatus === 'validating' && units.length === 0) {
    return (
      <span className="flex h-11 min-h-[44px] items-center px-2 text-xs font-medium text-[var(--color-text-muted)]">
        Loading units…
      </span>
    )
  }

  if (buStatus === 'error' && units.length === 0) {
    return (
      <span className="flex items-center gap-1">
        <span className="max-w-[9rem] truncate px-1 text-xs font-medium text-red-700" role="alert">
          {buError ?? 'Units failed to load.'}
        </span>
        <button
          type="button"
          onClick={refreshUnits}
          className="flex h-11 min-h-[44px] items-center rounded-lg border border-[var(--color-border)] px-2 text-xs font-bold"
        >
          Retry
        </button>
      </span>
    )
  }

  // Always visible so the user can fall back to All units even with 0-1 units.
  return (
    <select
      value={selectedBuId ?? ''}
      onChange={(e) => setSelectedBuId(e.target.value || null)}
      aria-label="Business unit"
      className="h-11 min-h-[44px] max-w-[9rem] truncate rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 text-xs font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
    >
      <option value="">All units</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  )
}

function DesktopUnitSelector() {
  const { selectedBuId, setSelectedBuId, units, buStatus, buError, refreshUnits } = useBusinessUnit()

  if (buStatus === 'validating' && units.length === 0) {
    return <span className="text-sm text-[var(--color-text-muted)]">Loading units…</span>
  }

  if (buStatus === 'error' && units.length === 0) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-sm text-red-700" role="alert">
          {buError ?? 'Units failed to load.'}
        </span>
        <button
          type="button"
          onClick={refreshUnits}
          className="flex h-11 min-h-[44px] items-center rounded-xl border border-[var(--color-border)] px-3 text-sm font-bold"
        >
          Retry
        </button>
      </span>
    )
  }

  return (
    <select
      value={selectedBuId ?? ''}
      onChange={(e) => setSelectedBuId(e.target.value || null)}
      aria-label="Business unit"
      className="h-11 min-h-[44px] w-52 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
    >
      <option value="">All units</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  )
}

function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { logout } = useAuth()
  const { setSelectedBuId } = useBusinessUnit()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    setSelectedBuId(null)
    navigate('/login', { replace: true })
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        aria-label="Log out"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
      >
        <ArrowRightOnRectangleIcon className="w-5 h-5" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
    >
      <ArrowRightOnRectangleIcon className="w-5 h-5" />
      Log out
    </button>
  )
}

function BottomNav({ onNewSale }: { onNewSale: () => void }) {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`)
  const moreActive = MORE_GROUPS.some((g) => g.items.some((i) => isActive(i.to)))

  const home = PRIMARY_NAV[0]
  const sales = PRIMARY_NAV[1]
  const stock = PRIMARY_NAV[2]

  const navBtn =
    'flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition-colors'

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[200] border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid grid-cols-5 items-end px-1 py-1">
          <NavLink
            key={home.to}
            to={home.to}
            aria-current={isActive(home.to) ? 'page' : undefined}
            className={() =>
              cn(
                navBtn,
                isActive(home.to)
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] active:bg-[var(--color-bg-tertiary)]',
              )
            }
          >
            <NavIcon icon={home.icon} active={isActive(home.to)} />
            {home.label}
          </NavLink>
          <NavLink
            key={sales.to}
            to={sales.to}
            aria-current={isActive(sales.to) ? 'page' : undefined}
            className={() =>
              cn(
                navBtn,
                isActive(sales.to)
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] active:bg-[var(--color-bg-tertiary)]',
              )
            }
          >
            <NavIcon icon={sales.icon} active={isActive(sales.to)} />
            {sales.label}
          </NavLink>

          {/* Center FAB — opens New Sale directly, replaces Rooms tab */}
          <div className="flex min-h-[60px] items-start justify-center px-1 py-1">
            <button
              type="button"
              onClick={onNewSale}
              aria-label="New sale"
              className="flex h-14 w-14 min-h-[56px] min-w-[56px] -translate-y-3 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition-transform active:scale-95"
            >
              <PlusIcon className="h-7 w-7" />
            </button>
          </div>

          <NavLink
            key={stock.to}
            to={stock.to}
            aria-current={isActive(stock.to) ? 'page' : undefined}
            className={() =>
              cn(
                navBtn,
                isActive(stock.to)
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] active:bg-[var(--color-bg-tertiary)]',
              )
            }
          >
            <NavIcon icon={stock.icon} active={isActive(stock.to)} />
            {stock.label}
          </NavLink>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-current={moreActive ? 'page' : undefined}
            className={cn(
              navBtn,
              moreActive
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] active:bg-[var(--color-bg-tertiary)]',
            )}
          >
            <EllipsisHorizontalIcon className="h-6 w-6" />
            More
          </button>
        </div>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-5">
          {MORE_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {group.title}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={() =>
                      cn(
                        'flex min-h-[56px] items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-sm font-semibold transition-colors active:bg-[var(--color-bg-tertiary)]',
                        isActive(item.to)
                          ? 'text-[var(--color-accent)]'
                          : 'text-[var(--color-text-primary)]',
                      )
                    }
                  >
                    <ClipboardListIcon className="h-5 w-5 shrink-0 text-[var(--color-text-muted)]" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const { units } = useBusinessUnit()
  const location = useLocation()
  const navigate = useNavigate()
  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`)
  const [saleOpen, setSaleOpen] = useState(false)

  function handleSaleSaved() {
    setSaleOpen(false)
    // Land on transaction history so staff sees the new bill immediately.
    if (location.pathname !== '/sales') navigate('/sales')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Slim mobile header — brand + unit + logout icon only */}
      <header className="sticky top-0 z-[200] flex h-14 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 md:hidden">
        <span className="shrink-0 text-base font-bold text-[var(--color-accent)]">Invento</span>
        <div className="min-w-0 flex-1">
          <CompactUnitSelector />
        </div>
        <LogoutButton compact />
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex">
          <div className="border-b border-[var(--color-border)] px-5 py-4 text-xl font-bold text-[var(--color-accent)]">
            Invento
          </div>
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => setSaleOpen(true)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-3 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.98]"
            >
              <PlusIcon className="h-5 w-5" />
              New sale
            </button>
          </div>
          <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={() =>
                  cn(
                    'flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive(item.to)
                      ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]',
                  )
                }
              >
                <NavIcon icon={item.icon} active={isActive(item.to)} />
                {item.label === 'Home' ? 'Dashboard' : item.label}
              </NavLink>
            ))}
            {MORE_GROUPS.map((group) => (
              <div key={group.title} className="pt-3">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {group.title}
                </p>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={() =>
                      cn(
                        'flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive(item.to)
                          ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t border-[var(--color-border)] p-3">
            <p className="truncate px-1 pb-2 text-xs text-[var(--color-text-muted)]">{user?.username}</p>
            <LogoutButton />
          </div>
        </aside>

        {/* Main area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop topbar */}
          <header className="hidden items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 md:flex">
            <DesktopUnitSelector />
            <span className="truncate text-sm font-medium text-[var(--color-text-secondary)]">{user?.username}</span>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 pb-24 md:px-6 md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>

      <BottomNav onNewSale={() => setSaleOpen(true)} />
      <SaleFormModal
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        onSaved={handleSaleSaved}
        businessUnits={units}
      />
    </div>
  )
}

export function CloseIconButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
    >
      <XMarkIcon className="h-5 w-5" />
    </button>
  )
}
