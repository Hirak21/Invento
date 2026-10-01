import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listItems } from '@/services/masterData'
import { addRecipeIngredient, createRecipe, getCompatibleUnits, removeRecipeIngredient, updateRecipe } from '@/services/recipes'
import type { RecipeWithIngredients } from '@/types/recipe'
import type { BusinessUnit } from '@/types/master'

interface RecipeFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: (recipeId: string) => void
  initial?: RecipeWithIngredients | null
  businessUnits?: BusinessUnit[]
}

interface DraftIngredient {
  clientId: string
  item_id: string
  item_name: string
  quantity: number
  unit: string
  notes: string | null
}

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/

export function RecipeFormModal({ open, onClose, onSaved, initial, businessUnits }: RecipeFormModalProps) {
  const { selectedBuId } = useBusinessUnit()
  const [businessUnitId, setBusinessUnitId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [sellingPrice, setSellingPrice] = useState('')
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([])
  const [search, setSearch] = useState('')
  const [itemResults, setItemResults] = useState<{ id: string; name: string; base_unit: string; current_stock: number; selling_price: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; base_unit: string; current_stock: number; selling_price: string | null } | null>(null)
  const [compatibleUnits, setCompatibleUnits] = useState<string[]>([])
  const [chosenUnit, setChosenUnit] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const quantityRef = useRef<HTMLInputElement>(null)

  const isEditing = !!initial

  useEffect(() => {
    if (!open) return
    setBusinessUnitId(selectedBuId ?? businessUnits?.[0]?.id ?? '')
    setName('')
    setDescription('')
    setActive(true)
    setSellingPrice('')
    setIngredients([])
    setSearch('')
    setItemResults([])
    setSelectedItem(null)
    setCompatibleUnits([])
    setChosenUnit('')
    setQuantity('')
    setNotes('')
    setError(null)
    setSaving(false)
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [open, selectedBuId, businessUnits])

  useEffect(() => {
    if (initial) {
      setName(initial.recipe.name)
      setDescription(initial.recipe.description ?? '')
      setActive(initial.recipe.active)
      setSellingPrice(initial.recipe.selling_price ?? '')
      setIngredients(
        initial.ingredients.map((ing) => ({
          clientId: ing.id,
          item_id: ing.item_id,
          item_name: ing.item_name,
          quantity: ing.entered_quantity ?? ing.quantity,
          unit: ing.entered_unit ?? ing.unit,
          notes: ing.notes,
        })),
      )
      setBusinessUnitId(initial.recipe.business_unit_id)
    }
  }, [initial])

  const runSearch = useCallback((text: string) => {
    if (!businessUnitId || !text.trim()) {
      setItemResults([])
      return
    }
    setSearching(true)
    listItems({ business_unit_id: businessUnitId, search: text })
      .then((res) => setItemResults(res.items.slice(0, 20)))
      .catch(() => undefined)
      .finally(() => setSearching(false))
  }, [businessUnitId])

  useEffect(() => {
    if (!open) return
    if (search.trim()) {
      const t = setTimeout(() => runSearch(search), 200)
      return () => clearTimeout(t)
    } else {
      setItemResults([])
    }
  }, [search, open, runSearch])

  async function pickItem(item: { id: string; name: string; base_unit: string; current_stock: number; selling_price: string | null }) {
    setSelectedItem({ id: item.id, name: item.name, base_unit: item.base_unit, current_stock: item.current_stock, selling_price: item.selling_price })
    setSearch('')
    try {
      const res = await getCompatibleUnits(item.id)
      setCompatibleUnits(res.compatible_units.length > 0 ? res.compatible_units : [item.base_unit])
      setChosenUnit(item.base_unit)
    } catch {
      setCompatibleUnits([item.base_unit])
      setChosenUnit(item.base_unit)
    }
    setTimeout(() => quantityRef.current?.focus(), 50)
  }

  function addIngredient(event: FormEvent) {
    event.preventDefault()
    if (!selectedItem) return setError('Select an inventory item first.')
    const qty = Number(quantity)
    if (!qty || qty <= 0) return setError('Enter a valid quantity.')
    if (ingredients.some((ing) => ing.item_id === selectedItem.id)) {
      return setError(`'${selectedItem.name}' is already in this recipe — remove the existing line to change it.`)
    }
    setError(null)
    const newIngredient: DraftIngredient = {
      clientId: crypto.randomUUID(),
      item_id: selectedItem.id,
      item_name: selectedItem.name,
      quantity: qty,
      unit: chosenUnit || selectedItem.base_unit,
      notes: notes.trim() || null,
    }
    setIngredients((prev) => [...prev, newIngredient])
    setSelectedItem(null)
    setCompatibleUnits([])
    setChosenUnit('')
    setQuantity('')
    setNotes('')
    searchRef.current?.focus()
  }

  function removeIngredient(clientId: string) {
    setIngredients((prev) => prev.filter((ing) => ing.clientId !== clientId))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!businessUnitId) return setError('Select a business unit.')
    if (!name.trim()) return setError('Enter a recipe name.')
    if (ingredients.length === 0) return setError('Add at least one ingredient.')
    if (sellingPrice && !MONEY_RE.test(sellingPrice)) return setError('Enter a valid menu price (e.g. 120.00).')

    setSaving(true)
    try {
      let recipeId: string
      if (isEditing) {
        const updated = await updateRecipe(initial!.recipe.id, {
          name: name.trim(),
          description: description.trim() || null,
          active,
          selling_price: sellingPrice || null,
        })
        recipeId = updated.recipe.id
        // Remove existing lines and re-add the edited set.
        for (const ing of initial!.ingredients) {
          try {
            await removeRecipeIngredient(initial!.recipe.id, ing.id)
          } catch {
            // ignore — line may already be gone
          }
        }
      } else {
        const created = await createRecipe({
          name: name.trim(),
          business_unit_id: businessUnitId,
          description: description.trim() || undefined,
          active,
          selling_price: sellingPrice || undefined,
        })
        recipeId = created.recipe.id
      }

      for (const ing of ingredients) {
        await addRecipeIngredient(recipeId, {
          item_id: ing.item_id,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes || undefined,
        })
      }

      onSaved(recipeId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the recipe.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={isEditing ? 'Edit recipe' : 'New recipe'} onClose={onClose} wide>
      {!businessUnitId ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No business unit available. Add one in Settings first.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-4">
              <Input
                label="Recipe name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Roti Thali"
                autoComplete="off"
              />
              <Input
                label="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the recipe"
                className="min-h-[3.5rem] resize-y"
              />
              <Input
                label="Menu price ₹ (optional — needed to sell from the Menu tab)"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="e.g. 120.00"
                inputMode="decimal"
                autoComplete="off"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Active
                </label>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Bill of materials</h3>
                {ingredients.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
                    No ingredients yet. Search items below and add them.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {ingredients.map((ing) => (
                      <li key={ing.clientId} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{ing.item_name}</span>
                          <span className="text-xs text-slate-500">{ing.quantity} {ing.unit}{ing.notes ? ` · ${ing.notes}` : ''}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeIngredient(ing.clientId)}
                          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${ing.item_name}`}
                        >
                          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-lg bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Add ingredient</h3>
              <Input
                ref={searchRef}
                label=""
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item by name…"
                autoComplete="off"
              />
              {searching && <p className="text-xs text-slate-400">Searching…</p>}
              {itemResults.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {itemResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void pickItem({ id: item.id, name: item.name, base_unit: item.base_unit, current_stock: item.current_stock, selling_price: item.selling_price })}
                        className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{item.name}</span>
                          <span className="text-xs text-slate-400">{item.base_unit}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedItem && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-900">
                    <span className="font-medium">{selectedItem.name}</span>
                    <span className="text-slate-500"> · {selectedItem.base_unit}</span>
                  </p>
                  <div className="flex gap-2">
                    <Input
                      ref={quantityRef}
                      label=""
                      type="number"
                      min="0.001"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="Quantity"
                      autoComplete="off"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addIngredient(e as unknown as FormEvent)
                        }
                      }}
                    />
                    <label className="flex shrink-0 flex-col text-xs font-medium text-slate-600">
                      Unit
                      <select
                        value={chosenUnit}
                        onChange={(e) => setChosenUnit(e.target.value)}
                        className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                        aria-label="Ingredient unit"
                      >
                        {(compatibleUnits.length > 0 ? compatibleUnits : [selectedItem.base_unit]).map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Input
                    label=""
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    autoComplete="off"
                  />
                  <Button type="button" onClick={addIngredient} variant="secondary" className="w-full">
                    Add to recipe
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(null)
                      setCompatibleUnits([])
                      setChosenUnit('')
                      setSearch('')
                      setTimeout(() => searchRef.current?.focus(), 50)
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Cancel · pick another item
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" onClick={onClose} variant="secondary">
              Cancel
            </Button>
            <Button type="submit" pending={saving}>
              {isEditing ? 'Save changes' : 'Create recipe'}
            </Button>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  )
}
