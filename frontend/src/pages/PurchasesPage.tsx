import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Select'
import { PurchaseFormModal } from '@/features/purchases/PurchaseFormModal'
import { PurchaseDetailModal } from '@/features/purchases/PurchaseDetailModal'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listBusinessUnits, listSuppliers } from '@/services/masterData'
import { listPurchases } from '@/services/purchases'
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listPurchases({
        business_unit_id: selectedBuId ?? undefined,
        supplier_id: supplierFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      })
      setPurchases(res.purchases)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load purchases.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId, supplierFilter, dateFrom, dateTo])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void listBusinessUnits().then(setBusinessUnits).catch(() => undefined)
    void listSuppliers().then(setSuppliers).catch(() => undefined)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchases</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} purchase{total === 1 ? '' : 's'} recorded for this period.
          </p>
        </div>
        <Button
          onClick={() => {
            setSuccessNumber(null)
            setFormOpen(true)
          }}
        >
          + New purchase
        </Button>
      </div>

      {successNumber && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Purchase <span className="font-semibold">{successNumber}</span> recorded — stock has been updated.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <label className="block w-full">
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

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading purchases…</p>
      ) : purchases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          No purchases found for this period. Record your first purchase to see it here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
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
      )}

      <PurchaseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(number) => {
          setSuccessNumber(number)
          void load()
        }}
        businessUnits={businessUnits}
      />
      <PurchaseDetailModal
        purchase={detailPurchase}
        onClose={() => setDetailPurchase(null)}
        businessUnits={businessUnits}
        suppliers={suppliers}
      />
    </div>
  )
}
