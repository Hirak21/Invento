import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Select'
import { formatPaymentMethod } from '@/types/purchase'
import { formatDate, formatMoney } from '@/types/inventory'
import { setPurchasePaymentStatus } from '@/services/purchases'
import type { Purchase } from '@/types/purchase'
import type { BusinessUnit, Supplier } from '@/types/master'

interface PurchaseDetailModalProps {
  purchase: Purchase | null
  onClose: () => void
  onSettled?: () => void
  businessUnits: BusinessUnit[]
  suppliers: Supplier[]
}

function paymentStatusTone(status: string): 'healthy' | 'low' | 'out' | 'neutral' {
  if (status === 'paid') return 'healthy'
  if (status === 'pending') return 'low'
  return 'neutral'
}

export function PurchaseDetailModal({
  purchase,
  onClose,
  onSettled,
  businessUnits,
  suppliers,
}: PurchaseDetailModalProps) {
  const [settling, setSettling] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)

  if (!purchase) return null

  const unitName = businessUnits.find((bu) => bu.id === purchase.business_unit_id)?.name ?? '—'
  const supplierName = purchase.supplier_name ?? suppliers.find((s) => s.id === purchase.supplier_id)?.name ?? '—'
  const hasGst = purchase.items.some((l) => Number(l.gst_percent ?? 0) > 0) || Number(purchase.gst_amount ?? 0) > 0

  async function handleSettle() {
    setSettling(true)
    setSettleError(null)
    try {
      await setPurchasePaymentStatus(purchase!.id, 'paid')
      onSettled?.()
      onClose()
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : 'Could not update payment status.')
    } finally {
      setSettling(false)
    }
  }

  return (
    <Modal open title={`Purchase ${purchase.purchase_number}`} onClose={onClose} wide>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4">
          <Detail label="Purchase #" value={purchase.purchase_number} />
          <Detail label="Date" value={formatDate(purchase.purchased_at)} />
          <Detail label="Business unit" value={unitName} />
          <Detail label="Supplier" value={supplierName} />
          <Detail label="Reference" value={purchase.reference_number ?? '—'} />
          <Detail label="Payment method" value={formatPaymentMethod(purchase.payment_method)} />
          <Detail
            label="Payment status"
            value={
              <Badge tone={paymentStatusTone(purchase.payment_status)}>
                {purchase.payment_status}
              </Badge>
            }
          />
          <Detail label="Total amount" value={formatMoney(purchase.total_amount)} />
          {hasGst && (
            <>
              <Detail label="Subtotal" value={formatMoney(purchase.subtotal_amount ?? purchase.total_amount)} />
              <Detail label="GST" value={formatMoney(purchase.gst_amount ?? '0.00')} />
            </>
          )}
          {purchase.notes && (
            <div className="col-span-2 sm:col-span-4">
              <Detail label="Notes" value={purchase.notes} />
            </div>
          )}
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Items ({purchase.items.length})</h3>
          {/* Mobile: stacked line cards (no horizontal scrolling) */}
          <ul className="space-y-2 md:hidden">
            {purchase.items.map((line, index) => (
              <li key={index} className="rounded-xl border border-slate-200 bg-white p-3">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-semibold text-slate-900">{line.item_name}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                    {formatMoney(line.line_total)}
                  </span>
                </span>
                <span className="mt-1 block text-xs tabular-nums text-slate-500">
                  {line.quantity} {line.unit} × {formatMoney(line.unit_cost)}
                  {Number(line.gst_percent ?? 0) > 0 && ` + ${Number(line.gst_percent)}% GST`}
                </span>
              </li>
            ))}
            {hasGst && (
              <li className="space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                <span className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(purchase.subtotal_amount ?? purchase.total_amount)}</span>
                </span>
                <span className="flex justify-between text-slate-600">
                  <span>GST</span>
                  <span className="tabular-nums">{formatMoney(purchase.gst_amount ?? '0.00')}</span>
                </span>
                <span className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(purchase.total_amount)}</span>
                </span>
              </li>
            )}
          </ul>
          {/* Desktop: full table */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Unit</th>
                  <th className="px-4 py-3 text-right font-medium">Unit cost</th>
                  {hasGst && <th className="px-4 py-3 text-right font-medium">GST %</th>}
                  <th className="px-4 py-3 text-right font-medium">Standard price</th>
                  <th className="px-4 py-3 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchase.items.map((line, index) => {
                  const stdPrice = line.standard_purchase_price
                  const cost = Number(line.unit_cost)
                  const std = stdPrice ? Number(stdPrice) : 0
                  const diff = std > 0 ? ((cost - std) / std) * 100 : 0
                  const diffClass = Math.abs(diff) > 10 ? 'text-amber-600 font-medium' : 'text-slate-500'
                  return (
                    <tr key={index} className="transition-colors hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{line.item_name}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{line.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{line.unit}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(line.unit_cost)}</td>
                      {hasGst && (
                        <td className="px-4 py-3 text-right text-slate-700">
                          {Number(line.gst_percent ?? 0) ? `${Number(line.gst_percent)}%` : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        {stdPrice ? formatMoney(stdPrice) : '—'}
                        {stdPrice && (
                          <span className={`ml-1 text-xs ${diffClass}`}>
                            ({diff >= 0 ? '+' : ''}{diff.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatMoney(line.line_total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                {hasGst && (
                  <>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-4 py-2 text-slate-700" colSpan={hasGst ? 6 : 5}>
                        Subtotal
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {formatMoney(purchase.subtotal_amount ?? purchase.total_amount)}
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-4 py-2 text-slate-700" colSpan={hasGst ? 6 : 5}>
                        GST
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {formatMoney(purchase.gst_amount ?? '0.00')}
                      </td>
                    </tr>
                  </>
                )}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900" colSpan={hasGst ? 6 : 5}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {formatMoney(purchase.total_amount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {settleError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {settleError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {purchase.payment_status === 'pending' && (
            <Button onClick={handleSettle} pending={settling}>
              Mark paid
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  )
}