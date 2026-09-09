import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
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
}

interface LineDraft {
  item_id: string
  quantity: string
  unit_cost: string
}

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/

export function PurchaseFormModal({
  open,
  onClose,
  onSaved,
  businessUnits,
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
  const [lines, setLines] = useState<LineDraft[]>([{ item_id: '', quantity: '1', unit_cost: '' }])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // One key per modal session → retrying the same submission can't double-stock.
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (!open) return
    setBusinessUnitId(selectedBuId ?? businessUnits[0]?.id ?? '')
    setDate(new Date().toISOString().slice(0, 10))
    setLines([{ item_id: '', quantity: '1', unit_cost: '' }])
    setError(null)
    setPaymentMethod('cash')
    setPaymentStatus('paid')
    setReference('')
    setNotes('')
    setSupplierId('')
    setIdempotencyKey(crypto.randomUUID())
    void listSuppliers().then(setSuppliers).catch(() => undefined)
  }, [open, selectedBuId, businessUnits])

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

  const total = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          Number.isFinite(Number(line.quantity)) && MONEY_RE.test(line.unit_cost)
            ? sum + Number(line.quantity) * Number(line.unit_cost)
            : sum,
        0,
      ),
    [lines],
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!businessUnitId) return setError('Choose a business unit.')
    const validLines = lines.filter((line) => line.item_id)
    if (validLines.length === 0) return setError('Add at least one item line.')
    for (const line of validLines) {
      if (!/^\d+$/.test(line.quantity) || Number(line.quantity) <= 0)
        return setError('Quantities must be whole numbers above zero.')
      if (!MONEY_RE.test(line.unit_cost))
        return setError(`Enter a valid unit cost (e.g. 35.00) for every line.`)
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

  return (
    <Modal open={open} title="New purchase" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Business unit"
            value={businessUnitId}
            onChange={(e) => {
              setBusinessUnitId(e.target.value)
              setLines([{ item_id: '', quantity: '1', unit_cost: '' }])
            }}
          >
            <option value="">Select…</option>
            {businessUnits.map((bu) => (
              <option key={bu.id} value={bu.id}>
                {bu.name}
              </option>
            ))}
          </Select>
          <Select label="Supplier (optional)" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input
            label="Invoice / reference no. (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-700">Items</span>
          {lines.map((line, index) => {
            const selectedItem = items.find((i) => i.id === line.item_id)
            return (
              <div key={index} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Select label={index === 0 ? 'Item' : undefined} value={line.item_id} onChange={(e) => onItemPicked(index, e.target.value)}>
                    <option value="">Select item…</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.base_unit}) — Stock: {item.current_stock} {item.base_unit} · ₹{Number(item.purchase_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-full sm:w-24">
                  <Input
                    label={index === 0 ? 'Qty' : undefined}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    inputMode="numeric"
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Input
                    label={index === 0 ? 'Unit cost ₹' : undefined}
                    value={line.unit_cost}
                    onChange={(e) => updateLine(index, { unit_cost: e.target.value })}
                    inputMode="decimal"
                    placeholder={selectedItem ? Number(selectedItem.purchase_price).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                  />
                </div>
                {selectedItem && (
                  <div className="w-full sm:w-40 text-sm text-slate-500 pt-1">
                    Current stock: <span className="font-medium">{selectedItem.current_stock} {selectedItem.base_unit}</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${index + 1}`}
                >
                  ✕
                </Button>
              </div>
            )
          })}
          <Button variant="secondary" size="sm" onClick={() => setLines((c) => [...c, { item_id: '', quantity: '1', unit_cost: '' }])}>
            + Add line
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="sm:col-span-2">
            <label htmlFor="purchase-notes" className="mb-1 block text-sm font-medium text-slate-700">
              Notes (optional)
            </label>
            <textarea
              id="purchase-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">Total (indicative)</span>
          <span className="text-lg font-bold text-slate-900">
            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" pending={pending}>
            Record purchase
          </Button>
        </div>
      </form>
    </Modal>
  )
}
