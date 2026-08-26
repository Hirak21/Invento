import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { createAdjustment } from '@/services/stockOps'
import { ADJUSTMENT_REASONS } from '@/types/wastage'
import type { AdjustmentReason, AdjustmentRecord } from '@/types/wastage'
import type { InventoryItem } from '@/types/inventory'

interface AdjustmentModalProps {
  item: InventoryItem | null
  onClose: () => void
  onSaved: (record: AdjustmentRecord) => void
}

export function AdjustmentModal({ item, onClose, onSaved }: AdjustmentModalProps) {
  const [newQuantity, setNewQuantity] = useState('')
  const [reason, setReason] = useState<AdjustmentReason>('physical_count')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!item) return
    setNewQuantity(String(item.current_stock))
    setReason('physical_count')
    setNotes('')
    setError(null)
  }, [item])

  if (!item) return null
  const selectedItem = item

  const delta =
    /^\d+$/.test(newQuantity) ? Number(newQuantity) - selectedItem.current_stock : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!/^\d+$/.test(newQuantity)) return setError('Enter a counted quantity as a whole number.')

    setPending(true)
    try {
      const record = await createAdjustment({
        business_unit_id: selectedItem.business_unit_id,
        item_id: selectedItem.id,
        new_quantity: Number(newQuantity),
        reason,
        notes: notes.trim() || null,
        idempotency_key: crypto.randomUUID(),
      })
      onSaved(record)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the adjustment.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open title={`Adjust stock — ${item.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Current system stock: <span className="font-semibold text-slate-900">{item.current_stock} {item.base_unit}</span>
          <p className="mt-1 text-xs text-slate-400">
            Enter the physical count. The difference becomes an explicit adjustment movement.
          </p>
        </div>

        <Input
          label={`Counted quantity (${item.base_unit})`}
          value={newQuantity}
          onChange={(e) => setNewQuantity(e.target.value)}
          inputMode="numeric"
        />
        {delta !== null && delta !== 0 && (
          <p className={`text-xs ${delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {delta > 0 ? '+' : ''}{delta} {item.base_unit} will be{' '}
            {delta > 0 ? 'added to' : 'removed from'} stock.
          </p>
        )}
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)}>
          {ADJUSTMENT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
        />

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
            Record adjustment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
