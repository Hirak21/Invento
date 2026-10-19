import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Select'
import { PageHeader } from '@/components/ui/PageHeader'
import { PurchaseFormModal } from '@/features/purchases/PurchaseFormModal'
import { PurchaseDetailModal } from '@/features/purchases/PurchaseDetailModal'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listBusinessUnits, listSuppliers } from '@/services/masterData'
import { listPurchases, setPurchasePaymentStatus } from '@/services/purchases'
import type { BusinessUnit, Supplier } from '@/types/master'
import {
  formatPaymentMethod,
} from '@/types/purchase'
import type { Purchase } from '@/types/purchase'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function PurchasesPage() {
  const { selectedBuId } = useBusinessUnit()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [total, setTotal] = useState(0)
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [successNumber, setSuccessNumber] = useState<string | null>(null)
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [restockItemId, setRestockItemId] = useState<string | null>(null)
  const [pendingPurchases, setPendingPurchases] = useState<Purchase[]>([])
  const [dueLoading, setDueLoading] = useState(false)
  const [dueError, setDueError] = useState<string | null>(null)
  const [settlingId, setSettlingId] = useState<string | null>(null)

  // Per-callback request ids: only the newest in-flight load may write
  // state, so a slow response can never overwrite fresher data (or land
  // after unmount).
  const loadSeqRef = useRef(0)
  const loadDueSeqRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await listPurchases({
        business_unit_id: selectedBuId ?? undefined,
        supplier_id: supplierFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      })
      if (seq !== loadSeqRef.current) return
      setPurchases(res.purchases)
      setTotal(res.total)
    } catch (err) {
      if (seq !== loadSeqRef.current) return
      setError(err instanceof Error ? err.message : 'Could not load purchases.')
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [selectedBuId, supplierFilter, dateFrom, dateTo])

  const loadDue = useCallback(async () => {
    const seq = ++loadDueSeqRef.current
    setDueLoading(true)
    setDueError(null)
    try {
      const res = await listPurchases({
        business_unit_id: selectedBuId ?? undefined,
        supplier_id: supplierFilter || undefined,
        payment_status: 'pending',
        from: dateFrom || undefined,
        to: dateTo || undefined,
      })
      if (seq !== loadDueSeqRef.current) return
      setPendingPurchases(res.purchases)
    } catch (err) {
      if (seq !== loadDueSeqRef.current) return
      setDueError(err instanceof Error ? err.message : 'Could not load outstanding dues.')
    } finally {
      if (seq === loadDueSeqRef.current) setDueLoading(false)
    }
  }, [selectedBuId, supplierFilter, dateFrom, dateTo])

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadDue()])
  }, [load, loadDue])

  async function handleSettle(purchase: Purchase) {
    setSettlingId(purchase.id)
    setDueError(null)
    try {
      await setPurchasePaymentStatus(purchase.id, 'paid')
      await refreshAll()
    } catch (err) {
      setDueError(err instanceof Error ? err.message : 'Could not update payment status.')
    } finally {
      setSettlingId(null)
    }
  }

  const outstandingTotal = pendingPurchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)

  useEffect(() => {
    void load()
    return () => {
      loadSeqRef.current++ // invalidate in-flight results on unmount/dep change
    }
  }, [load])

  useEffect(() => {
    void loadDue()
    return () => {
      loadDueSeqRef.current++
    }
  }, [loadDue])

  useEffect(() => {
    let cancelled = false
    void listBusinessUnits()
      .then((units) => {
        if (!cancelled) setBusinessUnits(units)
      })
      .catch(() => undefined)
    void listSuppliers()
      .then((rows) => {
        if (!cancelled) setSuppliers(rows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Deep link from Dashboard Quick Actions ("+ Purchase") or Stock Restock:
  // open the create flow immediately, then clear the params.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setSuccessNumber(null)
      setRestockItemId(searchParams.get('item'))
      setFormOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchases"
        description={`${total} purchase${total === 1 ? '' : 's'} recorded for this period.`}
        actions={
          <Button
            onClick={() => {
              setSuccessNumber(null)
              setFormOpen(true)
            }}
          >
            + New purchase
          </Button>
        }
      />

      {successNumber && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Purchase <span className="font-semibold">{successNumber}</span> recorded — stock has been updated.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <label className="col-span-2 block w-full sm:col-span-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">Supplier</span>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Clear Due — every genuinely pending purchase, settled via the backend. */}
      <section aria-label="Clear due" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Clear Due</h2>
            <p className="text-xs text-slate-600">
              {pendingPurchases.length === 0
                ? 'No outstanding purchase payments.'
                : `${pendingPurchases.length} pending purchase${pendingPurchases.length === 1 ? '' : 's'} outstanding.`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Outstanding</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              ₹{outstandingTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {dueError && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {dueError}
          </p>
        )}

        {dueLoading ? (
          <p className="py-4 text-center text-sm text-slate-500">Loading outstanding dues…</p>
        ) : pendingPurchases.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {pendingPurchases.map((purchase) => (
              <li
                key={purchase.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-white p-2.5"
              >
                <button
                  type="button"
                  onClick={() => setDetailPurchase(purchase)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {purchase.purchase_number}
                    {purchase.supplier_name ? ` · ${purchase.supplier_name}` : ''}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatDate(purchase.purchased_at)} ·{' '}
                    {purchase.items.length === 1
                      ? purchase.items[0].item_name
                      : `${purchase.items.length} items`}
                    {' · '}
                    <Badge tone="low" size="sm">pending</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm font-bold tabular-nums text-slate-900">
                    ₹{Number(purchase.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </button>
                <Button
                  size="sm"
                  onClick={() => void handleSettle(purchase)}
                  pending={settlingId === purchase.id}
                  aria-label={`Mark ${purchase.purchase_number} as paid`}
                  className="shrink-0"
                >
                  Mark paid
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading purchases…</p>
      ) : purchases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          No purchases found for this period. Record your first purchase to see it here.
        </div>
      ) : (
        <>
          {/* Mobile: card list (no horizontal scrolling) */}
          <ul className="space-y-2 md:hidden">
            {purchases.map((purchase) => (
              <li key={purchase.id}>
                <button
                  type="button"
                  onClick={() => setDetailPurchase(purchase)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors active:bg-slate-50"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {purchase.purchase_number}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatDate(purchase.purchased_at)}
                        {purchase.supplier_name ? ` · ${purchase.supplier_name}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                      ₹{Number(purchase.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs">
                    <span className="truncate text-slate-500">
                      {purchase.items.length === 1
                        ? purchase.items[0].item_name
                        : `${purchase.items.length} items`}
                    </span>
                    <Badge tone={purchase.payment_status === 'paid' ? 'healthy' : 'low'} size="sm">
                      {purchase.payment_status}
                    </Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Purchase #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.map((purchase) => (
                <tr
                  key={purchase.id}
                  className="transition-colors hover:bg-indigo-50/40 cursor-pointer"
                  onClick={() => setDetailPurchase(purchase)}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{purchase.purchase_number}</span>
                    {purchase.reference_number && (
                      <span className="block text-xs text-slate-400">Ref: {purchase.reference_number}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(purchase.purchased_at)}</td>
                  <td className="px-4 py-3 text-slate-600">{purchase.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {purchase.items.length === 1
                      ? `${purchase.items[0].item_name}`
                      : `${purchase.items.length} items`}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    ₹{Number(purchase.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-600">{formatPaymentMethod(purchase.payment_method)}</span>{' '}
                    <Badge tone={purchase.payment_status === 'paid' ? 'healthy' : 'low'}>
                      {purchase.payment_status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      <PurchaseFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setRestockItemId(null)
        }}
        onSaved={(number) => {
          setSuccessNumber(number)
          void refreshAll()
        }}
        businessUnits={businessUnits}
        initialItemId={restockItemId}
      />
      <PurchaseDetailModal
        purchase={detailPurchase}
        onClose={() => setDetailPurchase(null)}
        onSettled={() => void refreshAll()}
        businessUnits={businessUnits}
        suppliers={suppliers}
      />
    </div>
  )
}
