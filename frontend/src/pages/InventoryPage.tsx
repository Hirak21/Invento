import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Select as FilterSelect } from '@/components/ui/Select'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { StockIcon, XMarkIcon } from '@/components/icons'
import { ItemDetailModal } from '@/features/inventory/ItemDetailModal'
import { ItemFormModal } from '@/features/inventory/ItemFormModal'
import { useAuth } from '@/hooks/useAuth'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listBusinessUnits, listCategories, listItems, listSuppliers, deleteItem, updateItem } from '@/services/masterData'
import { ITEM_TYPE_LABELS, formatMoney } from '@/types/inventory'
import type { InventoryItem } from '@/types/inventory'
import type { BusinessUnit, Category, Supplier } from '@/types/master'
import { cn } from '@/utils/cn'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out of stock' },
]

export function InventoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
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

  // Filter bottom sheet (mobile) with draft state — applied on demand.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftCategory, setDraftCategory] = useState('')
  const [draftSupplier, setDraftSupplier] = useState('')
  const [draftStatus, setDraftStatus] = useState('')

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

  function openFilters() {
    setDraftCategory(categoryFilter)
    setDraftSupplier(supplierFilter)
    setDraftStatus(statusFilter)
    setFiltersOpen(true)
  }

  function applyFilters() {
    setCategoryFilter(draftCategory)
    setSupplierFilter(draftSupplier)
    setStatusFilter(draftStatus)
    setFiltersOpen(false)
  }

  function clearFilters() {
    setDraftCategory('')
    setDraftSupplier('')
    setDraftStatus('')
    setCategoryFilter('')
    setSupplierFilter('')
    setStatusFilter('')
    setFiltersOpen(false)
  }

  const activeFilterCount = [categoryFilter, supplierFilter, statusFilter].filter(Boolean).length
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id
  const statusLabel = (v: string) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v

  const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDeleteItem(item: InventoryItem) {
    setDeleteConfirm(item)
    setDeleteError(null)
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    setDeleteLoading(true)
    try {
      await deleteItem(deleteConfirm.id)
      setDeleteConfirm(null)
      void load(search)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete item.'
      setDeleteError(msg)
      if (msg.includes('Cannot delete item with stock movements')) {
        // Offer to deactivate instead
        if (window.confirm(`${msg}\n\nDeactivate this item instead?`)) {
          await updateItem(deleteConfirm.id, { active: false })
          setDeleteConfirm(null)
          void load(search)
        }
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock"
        description={`${total} item${total === 1 ? '' : 's'}${selectedBuId ? ' in this unit' : ' across all units'}`}
        actions={
          isOwner ? (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              + New item
            </Button>
          ) : undefined
        }
      />

      {/* Search first — filters live behind one button on mobile */}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            label=""
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name or SKU…"
            aria-label="Search inventory"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={openFilters}
          aria-haspopup="dialog"
          className={cn(
            'flex h-[48px] shrink-0 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold transition-colors',
            activeFilterCount > 0
              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
              : 'border-slate-300 bg-white text-slate-700 active:bg-slate-50',
          )}
        >
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Active filters">
          {categoryFilter && (
            <FilterChip label={categoryName(categoryFilter)} onClear={() => setCategoryFilter('')} />
          )}
          {supplierFilter && (
            <FilterChip label={supplierName(supplierFilter)} onClear={() => setSupplierFilter('')} />
          )}
          {statusFilter && (
            <FilterChip label={statusLabel(statusFilter)} onClear={() => setStatusFilter('')} />
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="flex h-9 items-center rounded-full px-3 text-xs font-bold text-slate-500 underline underline-offset-2"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Desktop: secondary filters inline (room to spare) */}
      <div className="hidden gap-3 md:grid md:grid-cols-3">
        <FilterSelect label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Supplier" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Stock status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load(search)}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2 md:hidden" aria-label="Loading inventory">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No items found"
          description={search || activeFilterCount > 0 ? 'Try a different search or clear the filters.' : 'Add your first item to get started.'}
          action={
            activeFilterCount > 0 ? (
              <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
            ) : isOwner ? (
              <Button onClick={() => { setEditing(null); setFormOpen(true) }}>+ New item</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Mobile: compact square cards — 8+ items per screen, no horizontal scroll */}
          <ul className="grid grid-cols-2 gap-2 md:hidden">
            {items.map((item) => (
              <li key={item.id}>
                <div
                  className={cn(
                    'flex w-full flex-col rounded-2xl border-2 bg-white p-2 shadow-sm',
                    item.status === 'out'
                      ? 'border-red-200'
                      : item.status === 'low'
                        ? 'border-amber-200'
                        : 'border-slate-200',
                    !item.active && 'opacity-60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setDetailItem(item)}
                    aria-label={`View ${item.name} details`}
                    className="flex items-start justify-between gap-1.5 text-left"
                  >
                    <span className="icon-box-sm" aria-hidden="true">
                      <StockIcon className="h-5 w-5" />
                    </span>
                    <StatusBadge status={item.status} size="sm" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailItem(item)}
                    className="mt-1 min-w-0 text-left"
                  >
                    <span className="block truncate text-[13px] font-bold leading-tight text-slate-900">{item.name}</span>
                    <span className="block text-base font-bold tabular-nums leading-tight text-slate-900">
                      {item.current_stock}{' '}
                      <span className="text-[11px] font-semibold text-slate-500">{item.base_unit}</span>
                    </span>
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/purchases?new=1&item=${item.id}`)}
                    disabled={!item.active}
                    aria-label={`Restock ${item.name}`}
                    className="mt-1.5 min-h-[36px] w-full px-2 py-1 text-xs"
                  >
                    Restock
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: full table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Unit</th>
                  <th className="px-4 py-3 text-right font-semibold">Current</th>
                  <th className="px-4 py-3 text-right font-semibold">Min</th>
                  <th className="px-4 py-3 text-right font-semibold">Buy price</th>
                  <th className="px-4 py-3 text-right font-semibold">Stock value</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setDetailItem(item)}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${!item.active ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <span className="block text-xs text-slate-500">
                        {ITEM_TYPE_LABELS[item.item_type]}
                        {item.sku ? ` · ${item.sku}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.supplier_id ? suppliers.find((s) => s.id === item.supplier_id)?.name ?? '—' : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.base_unit}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{item.current_stock}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{item.min_stock_level}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatMoney(item.purchase_price)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatMoney(String(Number(item.current_stock) * Number(item.purchase_price)))}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/purchases?new=1&item=${item.id}`)}
                          disabled={!item.active}
                        >
                          Restock
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(item)
                            setFormOpen(true)
                          }}
                          disabled={!item.active}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDetailItem(item)}>
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-700"
                          disabled={!item.active}
                          onClick={() => void handleDeleteItem(item)}
                        >
                          Delete
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && items.length > 0 && (
        <p className="text-xs font-medium text-slate-400 md:hidden">Tap an item for movements, stock actions and details.</p>
      )}

      {/* Filter bottom sheet */}
      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        action={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="lg" onClick={clearFilters}>
              Clear all
            </Button>
            <Button size="lg" onClick={applyFilters}>
              Show results
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FilterSelect label="Category" value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Supplier" value={draftSupplier} onChange={(e) => setDraftSupplier(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Stock status" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </FilterSelect>
        </div>
      </BottomSheet>

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
      <Modal open={!!deleteConfirm} title="Delete item?" onClose={() => setDeleteConfirm(null)}>
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-600">
            Delete <strong className="text-slate-900">{deleteConfirm?.name}</strong>? This cannot be undone.
            {(deleteConfirm?.current_stock ?? 0) > 0 && (
              <> Item has {deleteConfirm?.current_stock} {deleteConfirm?.base_unit} in stock.</>
            )}
          </p>
          {deleteError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} pending={deleteLoading}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-600 bg-emerald-50 py-1 pl-3 pr-1.5 text-xs font-bold text-emerald-900">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="relative flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition-colors hover:bg-emerald-100 before:absolute before:-inset-2 before:content-['']"
      >
        <XMarkIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  )
}
