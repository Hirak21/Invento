import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Select'
import { SaleFormModal } from '@/features/sales/SaleFormModal'
import { ReceiptModal } from '@/features/billing/ReceiptModal'
import { RestaurantOrderSheet } from '@/features/restaurant/RestaurantOrderSheet'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { fetchSummary } from '@/services/dashboard'
import type { DashboardSummary } from '@/services/dashboard'
import { listRestaurantOrders } from '@/services/restaurantOrders'
import type { Sale } from '@/types/sale'
import {
  CartIcon,
  ClipboardListIcon,
  CubeTransparentIcon,
  PlusIcon,
  BanknotesIcon,
  ReceiptIcon,
} from '@/components/icons'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function money(value: string | number): string {
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function elapsedMinutes(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

function elapsedLabel(iso: string): string {
  const m = elapsedMinutes(iso)
  if (m < 60) return `${m}m waiting`
  return `${Math.floor(m / 60)}h ${m % 60}m waiting`
}

export function DashboardPage() {
  const { selectedBuId, units, buStatus, buError, refreshUnits, setSelectedBuId } = useBusinessUnit()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [orders, setOrders] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saleModalOpen, setSaleModalOpen] = useState(false)
  const [orderSheetOpen, setOrderSheetOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)

  const invalidStoredUnit =
    buStatus === 'ready' && selectedBuId !== null && units.length > 0 && !units.some((u) => u.id === selectedBuId)

  const load = useCallback(async () => {
    // Don't fetch with a stale ID while units are still validating.
    if (buStatus === 'validating') return
    setLoading(true)
    setError(null)
    try {
      const buParam = selectedBuId ?? undefined
      const [summaryData, ordersRes] = await Promise.all([
        fetchSummary({ period: 'today', business_unit_id: buParam }),
        listRestaurantOrders({ business_unit_id: buParam, status: 'active' }),
      ])
      setSummary(summaryData)
      setOrders(ordersRes.orders ?? [])
    } catch (err) {
      // Keep previous good data on refresh failure; only fresh load shows empty.
      setError(err instanceof Error ? err.message : 'Could not load today’s status.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId, buStatus])

  useEffect(() => {
    void load()
  }, [load])

  function handleRetry() {
    // Re-validate units first so a stale stored ID can't poison the retry.
    refreshUnits()
    void load()
  }

  function handleResetUnit() {
    setSelectedBuId(null)
  }

  const salesToday = summary ? Number(summary.totals.sales) : 0
  const salesCount = summary?.totals.sale_count ?? 0
  const lowStock = summary?.low_stock ?? []
  const outOfStock = lowStock.filter((i) => i.status === 'out')
  const oldestOrder = orders.length
    ? [...orders].sort((a, b) => +new Date(a.sold_at) - +new Date(b.sold_at))[0]
    : null

  const attentionCount =
    (oldestOrder ? 1 : 0) + outOfStock.length + Math.min(lowStock.filter((i) => i.status === 'low').length, 3)

  return (
    <div className="space-y-5">
      {/* Context header — no period tabs, no finance-first copy */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {greeting()}
        </h1>
        <p className="mt-0.5 text-sm font-medium text-slate-600">{todayLabel()}</p>
      </div>

      {invalidStoredUnit && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            The saved business unit is no longer available. Showing all units instead.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleResetUnit}>
            Reset to All units
          </Button>
        </div>
      )}

      {buStatus === 'error' && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{buError ?? 'Could not load business units.'}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{error}</p>
          <p className="mt-1 text-xs text-red-700">
            {summary ? 'Showing last good data. Retry to refresh.' : 'Nothing loaded yet. Retry to re-fetch.'}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      )}

      {/* TODAY — what is happening right now */}
      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          Today
        </h2>
        {buStatus === 'validating' || (loading && !summary) ? (
          <div className="grid grid-cols-2 gap-3" aria-label="Loading today's status">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : error && !summary ? (
          <Card>
            <p className="text-center text-sm font-semibold text-slate-900">Could not load today’s status.</p>
            <p className="mt-0.5 text-center text-xs text-slate-500">
              Check your connection or business unit, then retry.
            </p>
            <div className="mt-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => navigate('/sales')}
              className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50 min-h-[96px]"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <CartIcon className="h-4 w-4" /> Sales overview
              </span>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-slate-900">{money(salesToday)}</span>
              <span className="text-xs font-medium text-slate-500">
                {salesCount} bill{salesCount === 1 ? '' : 's'} today → tap for history
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/rooms')}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50 min-h-[96px]"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <ClipboardListIcon className="h-4 w-4" /> Active orders
              </span>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-slate-900">{orders.length}</span>
              <span className="text-xs font-medium text-slate-500">
                {orders.length === 0 ? 'Kitchen is clear' : 'Need action'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/stock-alerts')}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50 min-h-[96px]"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <CubeTransparentIcon className="h-4 w-4" /> Low stock
              </span>
              <span className={`mt-1 block text-2xl font-bold tabular-nums ${lowStock.length ? 'text-amber-700' : 'text-slate-900'}`}>
                {lowStock.length}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {outOfStock.length ? `${outOfStock.length} out of stock` : lowStock.length ? 'Needs restock' : 'All stocked'}
              </span>
            </button>
          </div>
        )}
      </section>

      {/* QUICK ACTIONS — what can I do immediately.
          Transactional actions grouped together (sale/purchase/expense/order);
          Receipts / Billing sits full-width at the bottom. 2-column
          mobile-first grid, every target 44px+ (Button lg = 52px min). */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" fullWidth onClick={() => setSaleModalOpen(true)} leftIcon={<PlusIcon className="h-5 w-5" />} className="min-w-0">
            <span className="truncate">New sale</span>
          </Button>
          <Button size="lg" variant="secondary" fullWidth onClick={() => navigate('/purchases?new=1')} leftIcon={<CartIcon className="h-5 w-5" />} className="min-w-0">
            <span className="truncate">+ Purchase</span>
          </Button>
          <Button size="lg" variant="secondary" fullWidth onClick={() => navigate('/expenses?new=1')} leftIcon={<BanknotesIcon className="h-5 w-5" />} className="min-w-0">
            <span className="truncate">+ Expense</span>
          </Button>
          <Button size="lg" variant="secondary" fullWidth onClick={() => setOrderSheetOpen(true)} leftIcon={<ClipboardListIcon className="h-5 w-5" />} className="min-w-0">
            <span className="truncate">Restaurant order</span>
          </Button>
          <Button
            size="lg"
            variant="outline"
            fullWidth
            onClick={() => setReceiptOpen(true)}
            leftIcon={<ReceiptIcon className="h-5 w-5" />}
            className="col-span-2 min-w-0"
          >
            <span className="truncate">Receipts / Billing</span>
          </Button>
        </div>
      </section>

      {/* NEEDS ATTENTION — actionable alerts only */}
      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
        </h2>
        {loading && !summary ? (
          <div className="space-y-2" aria-label="Loading alerts">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-20 rounded-2xl" />
            ))}
          </div>
        ) : attentionCount === 0 ? (
          <Card>
            <p className="text-center text-sm font-semibold text-slate-900">All clear 🎉</p>
            <p className="mt-0.5 text-center text-xs text-slate-500">No pending orders, no stock-outs.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {oldestOrder && (
              <button
                type="button"
                onClick={() => navigate('/rooms')}
                className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-left transition-colors active:bg-amber-100 min-h-[88px]"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {oldestOrder.room_number ? `Room ${oldestOrder.room_number}` : 'Walk-in'} · {oldestOrder.sale_number}
                  </span>
                  {oldestOrder.order_status && <StatusBadge status={oldestOrder.order_status} size="sm" />}
                </span>
                <span className="mt-1 block truncate text-sm text-slate-700">
                  {oldestOrder.items.map((l) => `${l.item_name} ×${l.quantity}`).join(' · ')}
                </span>
                <span className="mt-1 block text-xs font-bold text-amber-800">{elapsedLabel(oldestOrder.sold_at)} → tap to work the order</span>
              </button>
            )}
            {outOfStock.slice(0, 2).map((item) => (
              <button
                key={item.item_id}
                type="button"
                onClick={() => navigate('/inventory')}
                className="w-full rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-left transition-colors active:bg-red-100 min-h-[72px]"
              >
                <span className="text-sm font-bold text-slate-900">{item.item_name} — out of stock</span>
                <span className="mt-0.5 block text-xs font-medium text-red-800">0 {item.base_unit} left → tap to restock</span>
              </button>
            ))}
            {lowStock
              .filter((i) => i.status === 'low')
              .slice(0, 3 - Math.min(outOfStock.length, 2))
              .map((item) => (
                <button
                  key={item.item_id}
                  type="button"
                  onClick={() => navigate('/inventory')}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50 min-h-[72px]"
                >
                  <span className="text-sm font-bold text-slate-900">
                    {item.item_name} — {item.current_stock}/{item.min_stock_level} {item.base_unit}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-slate-500">Running low → tap to restock</span>
                </button>
              ))}
          </div>
        )}
      </section>

      {/* Money — secondary, plain high-contrast rows, no charts */}
      {summary && (
        <section aria-labelledby="money-heading">
          <h2 id="money-heading" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            Today’s money
          </h2>
          <Card padding="none" className="divide-y divide-slate-100 overflow-hidden">
            {[
              { label: 'Sales', value: money(summary.totals.sales) },
              { label: 'Purchases', value: money(summary.totals.purchases) },
              { label: 'Expenses', value: money(summary.totals.expenses) },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-slate-600">{row.label}</span>
                <span className="text-sm font-bold tabular-nums text-slate-900">{row.value}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <SaleFormModal
        open={saleModalOpen}
        onClose={() => setSaleModalOpen(false)}
        onSaved={() => {
          setSaleModalOpen(false)
          void load()
        }}
        businessUnits={units}
      />
      <ReceiptModal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        businessUnitId={selectedBuId ?? undefined}
      />
      <RestaurantOrderSheet
        open={orderSheetOpen}
        onClose={() => setOrderSheetOpen(false)}
        onSent={() => void load()}
      />
    </div>
  )
}
