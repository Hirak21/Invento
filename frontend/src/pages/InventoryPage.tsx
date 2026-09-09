import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Select as FilterSelect } from '@/components/ui/Select'
import { ItemDetailModal } from '@/features/inventory/ItemDetailModal'
import { ItemFormModal } from '@/features/inventory/ItemFormModal'
import { useAuth } from '@/hooks/useAuth'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listBusinessUnits, listCategories, listItems, listSuppliers } from '@/services/masterData'
import { ITEM_TYPE_LABELS, formatMoney } from '@/types/inventory'
import type { InventoryItem } from '@/types/inventory'
import type { BusinessUnit, Category, Supplier } from '@/types/master'

export function InventoryPage() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const { selectedBuId } = useBusinessUnit()

  const [items, setItems] = useState<InventoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(
    async (searchText: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await listItems({
          business_unit_id: selectedBuId ?? undefined,
          category_id: categoryFilter || undefined,
          supplier_id: supplierFilter || undefined,
          status: statusFilter || undefined,
          search: searchText || undefined,
        })
        setItems(res.items)
        setTotal(res.total)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load inventory.')
      } finally {
        setLoading(false)
      }
    },
    [selectedBuId, categoryFilter, statusFilter, supplierFilter],
  )

  useEffect(() => {
    void load(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  useEffect(() => {
    void listBusinessUnits().then(setBusinessUnits).catch(() => undefined)
    void listCategories().then(setCategories).catch(() => undefined)
    void listSuppliers().then(setSuppliers).catch(() => undefined)
  }, [])

  function onSearchChange(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void load(value), 300)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} item{total === 1 ? '' : 's'}
            {selectedBuId ? ' in the selected unit' : ' across all units'}.
          </p>
        </div>
        {isOwner && (
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            + New item
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input label="Search" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Name or SKU…" />
        <FilterSelect
          label="Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Supplier"
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Stock status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="healthy">Healthy</option>
          <option value="low">Low</option>
          <option value="out">Out of stock</option>
        </FilterSelect>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading inventory…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          No inventory items found{search || categoryFilter || statusFilter ? ' for these filters.' : ' yet. Add your first item to get started.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 text-right font-medium">Current</th>
                <th className="px-4 py-3 text-right font-medium">Min</th>
                <th className="px-4 py-3 text-right font-medium">Buy price</th>
                <th className="px-4 py-3 text-right font-medium">Stock value</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setDetailItem(item)}
                  className={`cursor-pointer transition-colors hover:bg-indigo-50/50 ${
                    !item.active ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{item.name}</span>
                    <span className="block text-xs text-slate-400">
                      {ITEM_TYPE_LABELS[item.item_type]}
                      {item.sku ? ` · ${item.sku}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.supplier_id
                      ? suppliers.find((s) => s.id === item.supplier_id)?.name ?? '—'
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.base_unit}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{item.current_stock}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{item.min_stock_level}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatMoney(item.purchase_price)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {formatMoney(String(Number(item.current_stock) * Number(item.purchase_price)))}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={item.status}>{item.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDetailItem(item)
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">Click any row to see details and its full movement history.</p>

      <ItemFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load(search)}
        businessUnits={businessUnits}
        suppliers={suppliers}
        editing={editing}
      />
      <ItemDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={(item) => {
          setDetailItem(null)
          setEditing(item)
          setFormOpen(true)
        }}
        onChanged={() => void load(search)}
        businessUnits={businessUnits}
        categories={categories}
        suppliers={suppliers}
      />
    </div>
  )
}
