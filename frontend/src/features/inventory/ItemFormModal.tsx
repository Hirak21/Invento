import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { createItem, listCategories, updateItem } from '@/services/masterData'
import {
  ITEM_TYPE_LABELS,
  UNITS,
} from '@/types/inventory'
import type { InventoryItem, ItemType } from '@/types/inventory'
import type { BusinessUnit, Category, Supplier } from '@/types/master'

interface ItemFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  businessUnits: BusinessUnit[]
  suppliers: Supplier[]
  editing: InventoryItem | null
}

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/

export function ItemFormModal({
  open,
  onClose,
  onSaved,
  businessUnits,
  suppliers,
  editing,
}: ItemFormModalProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [businessUnitId, setBusinessUnitId] = useState('')
  const [itemType, setItemType] = useState<ItemType>('shop_product')
  const [baseUnit, setBaseUnit] = useState<string>('pcs')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [minStockLevel, setMinStockLevel] = useState('0')
  const [openingStock, setOpeningStock] = useState('0')
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    void listCategories().then(setCategories).catch(() => undefined)
    if (editing) {
      setName(editing.name)
      setSku(editing.sku ?? '')
      setCategoryId(editing.category_id)
      setBusinessUnitId(editing.business_unit_id)
      setItemType(editing.item_type)
      setBaseUnit(editing.base_unit)
      setPurchasePrice(editing.purchase_price)
      setSellingPrice(editing.selling_price ?? '')
      setMinStockLevel(String(editing.min_stock_level))
      setSupplierId(editing.supplier_id ?? '')
      setNotes(editing.notes ?? '')
    } else {
      setName(''); setSku(''); setCategoryId(''); setBusinessUnitId(businessUnits[0]?.id ?? '')
      setItemType('shop_product'); setBaseUnit('pcs'); setPurchasePrice(''); setSellingPrice('')
      setMinStockLevel('0'); setOpeningStock('0'); setSupplierId(''); setNotes('')
    }
    setErrors({})
    setServerError(null)
  }, [open, editing, businessUnits])

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Name is required.'
    if (!businessUnitId) next.businessUnitId = 'Choose a business unit.'
    if (!categoryId) next.categoryId = 'Choose a category.'
    if (!MONEY_RE.test(purchasePrice)) next.purchasePrice = 'Enter a valid amount, e.g. 125.50'
    if (sellingPrice && !MONEY_RE.test(sellingPrice))
      next.sellingPrice = 'Enter a valid amount or leave empty.'
    if (!/^\d+$/.test(minStockLevel)) next.minStockLevel = 'Must be a whole number.'
    if (!editing && !/^\d+$/.test(openingStock)) next.openingStock = 'Must be a whole number.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setServerError(null)
    if (!validate()) return
    setPending(true)
    try {
      if (editing) {
        await updateItem(editing.id, {
          name: name.trim(),
          sku: sku.trim() || undefined,
          category_id: categoryId,
          item_type: itemType,
          purchase_price: purchasePrice,
          selling_price: sellingPrice || null,
          min_stock_level: Number(minStockLevel),
          supplier_id: supplierId || null,
          notes: notes.trim() || null,
        })
      } else {
        await createItem({
          name: name.trim(),
          sku: sku.trim() || undefined,
          category_id: categoryId,
          business_unit_id: businessUnitId,
          item_type: itemType,
          base_unit: baseUnit,
          purchase_price: purchasePrice,
          selling_price: sellingPrice || null,
          min_stock_level: Number(minStockLevel),
          opening_stock: Number(openingStock),
          supplier_id: supplierId || null,
          notes: notes.trim() || null,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      // Values preserved so the user can fix and resubmit.
      setServerError(err instanceof Error ? err.message : 'Could not save the item.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} title={editing ? 'Edit item' : 'New inventory item'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
        <Input label="SKU / code (optional)" value={sku} onChange={(e) => setSku(e.target.value)} />
        <Select
          label="Business unit"
          value={businessUnitId}
          onChange={(e) => setBusinessUnitId(e.target.value)}
          disabled={!!editing}
          error={errors.businessUnitId}
        >
          <option value="">Select…</option>
          {businessUnits.map((bu) => (
            <option key={bu.id} value={bu.id}>
              {bu.name}
            </option>
          ))}
        </Select>
        <Select
          label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          error={errors.categoryId}
        >
          <option value="">Select…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select label="Item type" value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)}>
          {(Object.keys(ITEM_TYPE_LABELS) as ItemType[]).map((t) => (
            <option key={t} value={t}>
              {ITEM_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select
          label="Base unit"
          value={baseUnit}
          onChange={(e) => setBaseUnit(e.target.value)}
          disabled={!!editing}
          hint={editing ? 'Unit cannot change after creation.' : 'e.g. pcs, kg, litre'}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Input
          label="Purchase price (₹)"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          error={errors.purchasePrice}
        />
        <Input
          label="Selling price (₹, optional)"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          error={errors.sellingPrice}
        />
        <Input
          label="Minimum stock level"
          value={minStockLevel}
          onChange={(e) => setMinStockLevel(e.target.value)}
          inputMode="numeric"
          error={errors.minStockLevel}
        />
        {!editing && (
          <Input
            label="Opening stock"
            value={openingStock}
            onChange={(e) => setOpeningStock(e.target.value)}
            inputMode="numeric"
            hint="Recorded as an opening movement in the stock ledger."
            error={errors.openingStock}
          />
        )}
        <Select label="Default supplier (optional)" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">None</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="notes-area">
            Notes (optional)
          </label>
          <textarea
            id="notes-area"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
        </div>

        {serverError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {serverError}
          </p>
        )}

        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" pending={pending}>
            {editing ? 'Save changes' : 'Create item'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
