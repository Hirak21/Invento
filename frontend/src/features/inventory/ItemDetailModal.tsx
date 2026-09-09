import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Select'
import { AdjustmentModal } from '@/features/inventory/AdjustmentModal'
import { EmptyState } from '@/components/ui/Card'
import { listItemMovements, deleteItem } from '@/services/masterData'
import {
  ITEM_TYPE_LABELS,
  formatDate,
  formatMoney,
} from '@/types/inventory'
import type { InventoryItem, Movement } from '@/types/inventory'
import type { BusinessUnit, Category, Supplier } from '@/types/master'

interface ItemDetailModalProps {
  item: InventoryItem | null
  onClose: () => void
  onEdit?: (item: InventoryItem) => void
  onChanged?: () => void
  businessUnits: BusinessUnit[]
  categories: Category[]
  suppliers: Supplier[]
}

function movementTone(type: string): 'healthy' | 'low' | 'out' | 'neutral' {
  if (type === 'PURCHASE' || type === 'ADJUSTMENT_IN') return 'healthy'
  if (type === 'SALE') return 'out'
  if (type === 'WASTAGE' || type === 'ADJUSTMENT_OUT') return 'low'
  return 'neutral'
}

export function ItemDetailModal({
  item,
  onClose,
  onEdit,
  onChanged,
  businessUnits,
  categories,
  suppliers,
}: ItemDetailModalProps) {
  const [movements, setMovements] = useState<Movement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  async function handleDelete() {
    if (!item) return
    setDeleteLoading(true)
    try {
      await deleteItem(item.id)
      setShowDeleteConfirm(false)
      onClose()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete item.')
    } finally {
      setDeleteLoading(false)
    }
  }

  useEffect(() => {
    if (!item) return
    setMovements(null)
    setError(null)
    listItemMovements(item.id)
      .then((res) => setMovements(res.movements))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load movements.'))
  }, [item])

  if (!item) return null

  const unitName = businessUnits.find((bu) => bu.id === item.business_unit_id)?.name ?? '—'
  const categoryName = categories.find((c) => c.id === item.category_id)?.name ?? '—'
  const supplierName = suppliers.find((s) => s.id === item.supplier_id)?.name
  const stockValue = Number(item.current_stock) * Number(item.purchase_price)

  return (
    <Modal open title={item.name} onClose={onClose} wide>
      <div className="space-y-5">
        {onEdit && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAdjustOpen(true)}>
              Adjust stock
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onEdit(item)}>
              Edit item
            </Button>
            <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}>
              Delete
            </Button>
          </div>
        )}
        {showDeleteConfirm && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800 mb-3">
              Delete <strong>{item.name}</strong>? This cannot be undone.
              {item.current_stock > 0 && ` Item has ${item.current_stock} ${item.base_unit} in stock.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} pending={deleteLoading}>
                Delete
              </Button>
            </div>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <Detail label="Business unit" value={unitName} />
          <Detail label="Category" value={categoryName} />
          <Detail label="Type" value={ITEM_TYPE_LABELS[item.item_type]} />
          <Detail label="Current stock" value={`${item.current_stock} ${item.base_unit}`} />
          <Detail label="Minimum level" value={`${item.min_stock_level}`} />
          <Detail label="Status" value={<Badge tone={item.status}>{item.status}</Badge>} />
          <Detail label="Purchase price" value={formatMoney(item.purchase_price)} />
          <Detail label="Selling price" value={item.selling_price ? formatMoney(item.selling_price) : '—'} />
          <Detail label="Stock value (at cost)" value={formatMoney(String(stockValue))} />
          {item.sku && <Detail label="SKU" value={item.sku} />}
          {supplierName && <Detail label="Supplier" value={supplierName} />}
          {!item.active && (
            <div className="col-span-2 sm:col-span-3">
              <Badge tone="neutral">Inactive</Badge>
            </div>
          )}
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Stock movements</h3>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {!error && movements === null && <p className="text-sm text-slate-500">Loading…</p>}
          {!error && movements !== null && movements.length === 0 && (
            <EmptyState message="No stock movements yet for this item." />
          )}
          {!error && movements !== null && movements.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Unit cost</th>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                    <th className="px-4 py-3 font-medium">Date / User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((mv) => {
                    const inbound =
                      mv.movement_type === 'PURCHASE' || mv.movement_type === 'ADJUSTMENT_IN'
                    const qty = Number(mv.quantity)
                    return (
                      <tr key={mv.id} className="transition-colors hover:bg-slate-50/50">
                        <td className="px-4 py-2.5">
                          <Badge tone={movementTone(mv.movement_type)}>
                            {mv.movement_type.replace('_', ' ').toLowerCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={inbound ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
                            {inbound ? '+' : '−'}{qty} {mv.unit}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {mv.unit_cost ? formatMoney(mv.unit_cost) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {mv.reference_type}
                          {mv.reference_id && (
                            <span className="text-xs text-slate-400 ml-1">#{mv.reference_id.slice(-8)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">
                          {mv.notes ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">
                          {formatDate(mv.created_at)}
                          {mv.created_by_username && <span className="block">by {mv.created_by_username}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AdjustmentModal
        item={adjustOpen ? item : null}
        onClose={() => setAdjustOpen(false)}
        onSaved={() => {
          setAdjustOpen(false)
          onClose()
          onChanged?.()
        }}
      />
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
