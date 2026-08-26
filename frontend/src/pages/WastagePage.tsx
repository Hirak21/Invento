import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listItems } from '@/services/masterData'
import { createWastage, listWastage } from '@/services/stockOps'
import { formatReason, WASTAGE_REASONS } from '@/types/wastage'
import type { InventoryItem } from '@/types/inventory'
import type { WastageRecord, WastageReason } from '@/types/wastage'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function WastagePage() {
  const { selectedBuId } = useBusinessUnit()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [records, setRecords] = useState<WastageRecord[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState<WastageReason>('spoiled')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listWastage({ business_unit_id: selectedBuId ?? undefined })
      setRecords(res.records)
      setTotalValue(res.records.reduce((sum, r) => sum + Number(r.estimated_value), 0))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load wastage records.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedBuId) return
    void listItems({ business_unit_id: selectedBuId })
      .then((res) => setItems(res.items))
      .catch(() => undefined)
  }, [selectedBuId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccessMsg(null)
    if (!selectedBuId && items.length === 0)
      return setError('Select a business unit in the top bar first.')
    if (!itemId) return setError('Choose an item.')
    if (!/^\d+$/.test(quantity) || Number(quantity) <= 0)
      return setError('Quantity must be a whole number above zero.')

    setPending(true)
    try {
      const record = await createWastage({
        business_unit_id: selectedBuId ?? items.find((i) => i.id === itemId)!.business_unit_id,
        item_id: itemId,
        quantity: Number(quantity),
        reason,
        notes: notes.trim() || null,
        date,
        idempotency_key: crypto.randomUUID(),
      })
      setSuccessMsg(
        `Wastage recorded: ${record.quantity} ${record.unit} of ${record.item_name} (${formatReason(record.reason)}).`,
      )
      setItemId('')
      setQuantity('1')
      setNotes('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record wastage.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Wastage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stock lost without a sale — every entry is traceable in the ledger.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
        <Card title="Record wastage">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Select label="Item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Select item…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.current_stock} {item.base_unit})
                </option>
              ))}
            </Select>
            <Input
              label="Quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="numeric"
            />
            <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as WastageReason)}>
              {WASTAGE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
            <Button type="submit" pending={pending} className="w-full">
              Record wastage
            </Button>
          </form>
        </Card>

        <div className="space-y-3">
          {successMsg && (
            <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {successMsg}
            </p>
          )}
          {!successMsg && error && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <Card
            title="Recent wastage"
            action={
              records.length > 0 ? (
                <span className="text-xs text-slate-400">
                  Est. value ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              ) : undefined
            }
          >
            {loading ? (
              <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : records.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
                No wastage recorded for this period.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {records.slice(0, 20).map((record) => (
                  <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{record.item_name}</span>
                      <span className="ml-2 text-red-600">
                        −{record.quantity} {record.unit}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {formatReason(record.reason)} · {formatDate(record.wasted_at)}
                        {record.created_by_username ? ` · by ${record.created_by_username}` : ''}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">
                      ≈ ₹{Number(record.estimated_value).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
