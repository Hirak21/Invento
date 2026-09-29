import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listItems } from '@/services/masterData'
import { addRecipeIngredient, createRecipe, removeRecipeIngredient, updateRecipe } from '@/services/recipes'
import type { Recipe, RecipeIngredient, RecipeWithIngredients } from '@/types/recipe'
import type { BusinessUnit } from '@/types/master'

interface RecipeFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: (recipeId: string) => void
  initial?: RecipeWithIngredients | null
  businessUnits?: BusinessUnit[]
}

export function RecipeFormModal({ open, onClose, onSaved, initial, businessUnits }: RecipeFormModalProps) {
  const { selectedBuId } = useBusinessUnit()
  const [businessUnitId, setBusinessUnitId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [search, setSearch] = useState('')
  const [itemResults, setItemResults] = useState<{ id: string; name: string; base_unit: string; current_stock: number; selling_price: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; base_unit: string; current_stock: number; selling_price: string | null } | null>(null)
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
    setIngredients([])
    setSearch('')
    setItemResults([])
    setSelectedItem(null)
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
      setIngredients(initial.ingredients)
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

  function addIngredient(event: FormEvent) {
    event.preventDefault()
    if (!selectedItem) return setError('Select an inventory item first.')
    const qty = Number(quantity)
    if (!qty || qty <= 0) return setError('Enter a valid quantity.')
    if (qty > (selectedItem.current_stock ?? Infinity)) {
      return setError(`Only ${selectedItem.current_stock} ${selectedItem.base_unit} of '${selectedItem.name}' in stock.`)
    }
    setError(null)
    const newIngredient: RecipeIngredient = {
      id: crypto.randomUUID(),
      recipe_id: isEditing ? initial!.recipe.id : '',
      item_id: selectedItem.id,
      item_name: selectedItem.name,
      quantity: qty,
      unit: selectedItem.base_unit,
      notes: notes.trim() || null,
    }
    setIngredients((prev) => [...prev, newIngredient])
    setSelectedItem(null)
    setQuantity('')
    setNotes('')
    searchRef.current?.focus()
  }

  function removeIngredient(id: string) {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!businessUnitId) return setError('Select a business unit.')
    if (!name.trim()) return setError('Enter a recipe name.')
    if (ingredients.length === 0) return setError('Add at least one ingredient.')

    setSaving(true)
    try {
      let recipe: Recipe
      if (isEditing) {
        recipe = await updateRecipe(initial!.recipe.id, {
          name: name.trim(),
          description: description.trim() || null,
          active,
        })
        // Remove existing ingredients and re-add
        for (const ing of initial!.ingredients) {
          try {
            await removeRecipeIngredient(initial!.recipe.id, ing.id)
          } catch {
            // ignore
          }
        }
      } else {
        recipe = await createRecipe({
          name: name.trim(),
          business_unit_id: businessUnitId,
          description: description.trim() || undefined,
          active,
        })
      }

      for (const ing of ingredients) {
        await addRecipeIngredient(recipe.id, {
          item_id: ing.item_id,
          quantity: ing.quantity,
          notes: ing.notes || undefined,
        })
      }

      onSaved(recipe.id)
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
                      <li key={ing.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{ing.item_name}</span>
                          <span className="text-xs text-slate-500">{ing.quantity} {ing.unit}{ing.notes ? ` · ${ing.notes}` : ''}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeIngredient(ing.id)}
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
                        onClick={() => {
                          setSelectedItem({ id: item.id, name: item.name, base_unit: item.base_unit, current_stock: item.current_stock, selling_price: item.selling_price })
                          setSearch('')
                          setTimeout(() => quantityRef.current?.focus(), 50)
                        }}
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
                  <Input
                    ref={quantityRef}
                    label=""
                    type="number"
                    min="0.01"
                    step="0.01"
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
