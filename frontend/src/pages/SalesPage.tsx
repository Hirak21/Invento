import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { SaleFormModal } from '@/features/sales/SaleFormModal'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listBusinessUnits } from '@/services/masterData'
import { listSales } from '@/services/sales'
import type { BusinessUnit } from '@/types/master'
import { formatPaymentMethod } from '@/types/purchase'
import type { Sale } from '@/types/sale'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function SalesPage() {
  const { selectedBuId } = useBusinessUnit()
  const [sales, setSales] = useState<Sale[]>([])
  const [total, setTotal] = useState(0)
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [successInfo, setSuccessInfo] = useState<{ number: string; total: string } | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listSales({
        business_unit_id: selectedBuId ?? undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      })
      setSales(res.sales)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sales.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId, dateFrom, dateTo])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void listBusinessUnits().then(setBusinessUnits).catch(() => undefined)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} sale{total === 1 ? '' : 's'} recorded for this period.
          </p>
        </div>
        <Button
          onClick={() => {
            setSuccessInfo(null)
            setFormOpen(true)
          }}
        >
          + New sale
        </Button>
      </div>

      {successInfo && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Sale <span className="font-semibold">{successInfo.number}</span> completed · ₹
          {Number(successInfo.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })} — stock updated.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading sales…</p>
      ) : sales.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          No sales recorded for this period.
        </div>
      ) : (
        <>
          {/* Mobile: card list (no horizontal scrolling) */}
          <ul className="space-y-2 md:hidden">
            {sales.map((sale) => (
              <li key={sale.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {sale.room_number ? `Room ${sale.room_number} · ` : ''}{sale.sale_number}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(sale.sold_at)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-900">
                    ₹{Number(sale.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {sale.items.length === 1
                    ? `${sale.items[0].quantity} × ${sale.items[0].item_name}`
                    : `${sale.items.reduce((n, line) => n + line.quantity, 0)} units of ${sale.items.length} items`}
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-slate-500">{formatPaymentMethod(sale.payment_method)}</span>
                  {sale.order_status === 'CANCELLED' ? (
                    <Badge tone="out">cancelled</Badge>
                  ) : sale.order_status !== 'SERVED' ? (
                    <Badge tone="low">{sale.order_status.toLowerCase()}</Badge>
                  ) : (
                    <Badge tone="healthy">completed</Badge>
                  )}
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Sale #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((sale) => (
                <tr key={sale.id} className="transition-colors hover:bg-indigo-50/40">
                  <td className="px-4 py-3 font-medium text-slate-900">{sale.sale_number}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(sale.sold_at)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {sale.items.length === 1
                      ? `${sale.items[0].quantity} × ${sale.items[0].item_name}`
                      : `${sale.items.reduce((n, line) => n + line.quantity, 0)} units of ${sale.items.length} items`}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-600">{formatPaymentMethod(sale.payment_method)}</span>{' '}
                    <Badge tone="healthy">completed</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    ₹{Number(sale.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      <SaleFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(number, totalAmount) => {
          setSuccessInfo({ number, total: totalAmount })
          void load()
        }}
        businessUnits={businessUnits}
      />
    </div>
  )
}
