import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/Card'
import { listItemMovements } from '@/services/masterData'
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
  businessUnits,
  categories,
  suppliers,
}: ItemDetailModalProps) {
  const [movements, setMovements] = useState<Movement[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => onEdit(item)}>
              Edit item
            </Button>
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
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {movements.map((mv) => {
                const inbound =
                  mv.movement_type === 'PURCHASE' || mv.movement_type === 'ADJUSTMENT_IN'
                const qty = Number(mv.quantity)
                return (
                  <li key={mv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2">
                      <Badge tone={movementTone(mv.movement_type)}>
                        {mv.movement_type.replace('_', ' ').toLowerCase()}
                      </Badge>
                      <span className={inbound ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
                        {inbound ? '+' : '−'}
                        {qty} {mv.unit}
                      </span>
                      <span className="text-slate-400">{mv.reference_type}</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDate(mv.created_at)}
                      {mv.created_by_username ? ` · by ${mv.created_by_username}` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
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
