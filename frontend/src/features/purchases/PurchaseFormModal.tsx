import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { FormSheet } from '@/components/ui/FormSheet'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { XMarkIcon } from '@/components/icons'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { createPurchase } from '@/services/purchases'
import { listItems } from '@/services/masterData'
import { listSuppliers } from '@/services/masterData'
import type { InventoryItem } from '@/types/inventory'
import type { BusinessUnit, Supplier } from '@/types/master'
import { PAYMENT_METHODS } from '@/types/purchase'
import type { PaymentMethod, PaymentStatus } from '@/types/purchase'

interface PurchaseFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: (purchaseNumber: string) => void
  businessUnits: BusinessUnit[]
  /** Pre-select this item (Restock flow from the Stock page). */
  initialItemId?: string | null
}

interface LineDraft {
  item_id: string
  quantity: string
  unit_cost: string
  gst_percent: string
}

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/
const GST_RE = /^\d{1,3}(\.\d{1,2})?$/

function emptyLine(): LineDraft {
  return { item_id: '', quantity: '1', unit_cost: '', gst_percent: '' }
}

export function PurchaseFormModal({
  open,
  onClose,
  onSaved,
  businessUnits,
  initialItemId = null,
}: PurchaseFormModalProps) {
  const { selectedBuId } = useBusinessUnit()
  const [businessUnitId, setBusinessUnitId] = useState(selectedBuId ?? '')
  const [supplierId, setSupplierId] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Failed submits move keyboard/screen-reader focus to the error summary.
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])
  // One key per modal session → retrying the same submission can't double-stock.
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (!open) return
    const fallbackBu = selectedBuId ?? businessUnits[0]?.id ?? ''
    setBusinessUnitId(fallbackBu)
    setDate(new Date().toISOString().slice(0, 10))
    setLines([emptyLine()])
    setError(null)
    setPaymentMethod('cash')
    setPaymentStatus('paid')
    setReference('')
    setNotes('')
    setSupplierId('')
    setIdempotencyKey(crypto.randomUUID())
    void listSuppliers().then(setSuppliers).catch(() => undefined)
    // Restock flow: resolve the item across all units, switch the form to
    // its business unit, and pre-fill the first line (cost included).
    if (initialItemId) {
      void listItems()
        .then((res) => {
          const found = res.items.find((i) => i.id === initialItemId)
          if (!found) return
          setBusinessUnitId(found.business_unit_id)
          setLines([
            { item_id: found.id, quantity: '1', unit_cost: found.purchase_price, gst_percent: '' },
          ])
        })
        .catch(() => undefined)
    }
  }, [open, selectedBuId, businessUnits, initialItemId])

  useEffect(() => {
    if (!open || !businessUnitId) {
      setItems([])
      return
    }
    void listItems({ business_unit_id: businessUnitId })
      .then((res) => setItems(res.items))
      .catch(() => undefined)
  }, [open, businessUnitId])

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function onItemPicked(index: number, itemId: string) {
    const picked = items.find((i) => i.id === itemId)
    updateLine(index, {
      item_id: itemId,
      unit_cost: picked ? picked.purchase_price : '',
    })
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let gst = 0
    for (const line of lines) {
      const qty = Number(line.quantity)
      const cost = Number(line.unit_cost)
      const gstPct = line.gst_percent.trim() === '' ? 0 : Number(line.gst_percent)
      if (!Number.isFinite(qty) || qty <= 0 || !MONEY_RE.test(line.unit_cost)) continue
      if (!Number.isFinite(gstPct) || gstPct < 0 || gstPct > 100) continue
      const lineSub = qty * cost
      subtotal += lineSub
      gst += (lineSub * gstPct) / 100
    }
    return { subtotal, gst, total: subtotal + gst }
  }, [lines])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!businessUnitId) return setError('Choose a business unit.')
    const validLines = lines.filter((line) => line.item_id)
    if (validLines.length === 0) return setError('Add at least one item line.')
    for (const line of validLines) {
      if (!/^\d+(\.\d+)?$/.test(line.quantity.trim()) || Number(line.quantity) <= 0)
        return setError('Quantities must be positive numbers above zero (decimals allowed for kg/g).')
      if (!MONEY_RE.test(line.unit_cost) || Number(line.unit_cost) < 0)
        return setError('Enter a valid unit cost (e.g. 35.00) for every line.')
      const gstRaw = line.gst_percent.trim()
      if (gstRaw !== '' && (!GST_RE.test(gstRaw) || Number(gstRaw) < 0 || Number(gstRaw) > 100))
        return setError('GST % must be between 0 and 100 (decimals like 2.5 allowed).')
    }

    setPending(true)
    try {
      const purchase = await createPurchase({
        business_unit_id: businessUnitId,
        supplier_id: supplierId || null,
        items: validLines.map((line) => ({
          item_id: line.item_id,
          quantity: Number(line.quantity),
          unit_cost: line.unit_cost,
          gst_percent: line.gst_percent.trim() === '' ? 0 : Number(line.gst_percent),
        })),
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        reference_number: reference.trim() || null,
        notes: notes.trim() || null,
        date,
        idempotency_key: idempotencyKey,
      })
      onSaved(purchase.purchase_number)
      onClose()
    } catch (err) {
      // Same idempotency key reused on retry — safe resubmission.
      setError(err instanceof Error ? err.message : 'Could not record the purchase.')
    } finally {
      setPending(false)
    }
  }

  function money(n: number): string {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <FormSheet
      open={open}
      title="New purchase"
      onClose={onClose}
      action={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} className="whitespace-nowrap">
            Cancel
          </Button>
          <Button size="lg" pending={pending} type="submit" form="purchase-form" className="whitespace-nowrap">
            Record · ₹{money(totals.total)}
          </Button>
        </div>
      }
    >
      <form id="purchase-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Business unit"
            value={businessUnitId}
            onChange={(e) => {
              setBusinessUnitId(e.target.value)
              setLines([emptyLine()])
            }}
          >
            <option value="">Select…</option>
            {businessUnits.map((bu) => (
              <option key={bu.id} value={bu.id}>
                {bu.name}
              </option>
            ))}
          </Select>
          <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input
            label="Invoice / ref no."
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-semibold text-slate-900">Items</span>
          {lines.map((line, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
              <Select
                label={index === 0 ? 'Item' : undefined}
                aria-label={index === 0 ? undefined : `Line ${index + 1} item`}
                value={line.item_id}
                onChange={(e) => onItemPicked(index, e.target.value)}
              >
                <option value="">Select item…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.base_unit}) · ₹{Number(item.purchase_price).toFixed(2)}
                  </option>
                ))}
              </Select>
              {/* Field order: Quantity → Unit cost → GST % */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Input
                  label="Qty"
                  aria-label={`Line ${index + 1} quantity`}
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                />
                <Input
                  label="Unit cost ₹"
                  aria-label={`Line ${index + 1} unit cost`}
                  value={line.unit_cost}
                  onChange={(e) => updateLine(index, { unit_cost: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                />
                <Input
                  label="GST %"
                  aria-label={`Line ${index + 1} GST percent`}
                  value={line.gst_percent}
                  onChange={(e) => updateLine(index, { gst_percent: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {(() => {
                    const qty = Number(line.quantity)
                    const cost = Number(line.unit_cost)
                    const gstPct = line.gst_percent.trim() === '' ? 0 : Number(line.gst_percent)
                    if (!Number.isFinite(qty) || !Number.isFinite(cost) || !Number.isFinite(gstPct)) return '—'
                    const sub = qty * cost
                    return `Line total ₹${money(sub + (sub * gstPct) / 100)}${gstPct ? ` (incl. ${gstPct}% GST)` : ''}`
                  })()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${index + 1}`}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <XMarkIcon className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setLines((c) => [...c, emptyLine()])}>
            + Add line
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select label="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Select label="Payment status" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </Select>
        </div>
        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note…"
          maxLength={500}
        />

        <div className="space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="tabular-nums">₹{money(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>GST</span>
            <span className="tabular-nums">₹{money(totals.gst)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums">₹{money(totals.total)}</span>
          </div>
        </div>

        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
            {error}
          </p>
        )}
      </form>
    </FormSheet>
  )
}
