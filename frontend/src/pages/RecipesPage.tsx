import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Select'
import { PageHeader } from '@/components/ui/PageHeader'
import { XMarkIcon } from '@/components/icons'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { deleteRecipe, listRecipes } from '@/services/recipes'
import type { RecipeWithIngredients } from '@/types/recipe'
import { formatDate } from '@/types/inventory'
import { RecipeFormModal } from '@/features/recipes/RecipeFormModal'

function marginLabel(price: string | null, cost: string | null): string | null {
  const p = price ? Number(price) : 0
  const c = cost ? Number(cost) : 0
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c)) return null
  return `${(((p - c) / p) * 100).toFixed(0)}% margin`
}

function RecipeDetailModal({
  onClose,
  recipe,
  onEdit,
}: {
  onClose: () => void
  recipe: RecipeWithIngredients | null
  onEdit: (recipe: RecipeWithIngredients) => void
}) {
  if (!recipe) return null
  const margin = marginLabel(recipe.recipe.selling_price, recipe.recipe.estimated_cost)
  return (
    <Modal open title={recipe.recipe.name} onClose={onClose} wide>
      <div className="space-y-4">
        {recipe.recipe.description && (
          <p className="text-sm text-slate-600">{recipe.recipe.description}</p>
        )}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DetailStat label="Menu price" value={recipe.recipe.selling_price ? `₹${Number(recipe.recipe.selling_price).toFixed(2)}` : '—'} strong />
          <DetailStat label="Est. cost" value={recipe.recipe.estimated_cost ? `₹${Number(recipe.recipe.estimated_cost).toFixed(2)}` : '—'} />
          <DetailStat label="Margin" value={margin ?? '—'} strong={!!margin} />
          <DetailStat
            label="Status"
            value={<Badge tone={recipe.recipe.active ? 'healthy' : 'neutral'} size="sm">{recipe.recipe.active ? 'Active' : 'Inactive'}</Badge>}
          />
        </dl>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Ingredients ({recipe.ingredients.length})</h3>
          {recipe.ingredients.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No ingredients added yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-slate-900">{ing.item_name}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {ing.entered_quantity ?? ing.quantity} {ing.entered_unit ?? ing.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {recipe.ingredients.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              Created {formatDate(recipe.recipe.created_at)}
              {recipe.recipe.updated_at !== recipe.recipe.created_at && ` · Updated ${formatDate(recipe.recipe.updated_at)}`}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onEdit(recipe)}>
            Edit recipe
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DetailStat({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-0.5 tabular-nums ${strong ? 'text-base font-bold text-slate-900' : 'text-sm font-semibold text-slate-700'}`}>{value}</dd>
    </div>
  )
}

export function RecipesPage() {
  const { selectedBuId } = useBusinessUnit()
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<RecipeWithIngredients | null>(null)
  const [detailRecipe, setDetailRecipe] = useState<RecipeWithIngredients | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecipeWithIngredients | null>(null)
  const [deleting, setDeleting] = useState(false)
  const loadRecipes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listRecipes({
        business_unit_id: selectedBuId || undefined,
        active: undefined,
      })
      setRecipes(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recipes.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId])

  useEffect(() => {
    void loadRecipes()
  }, [loadRecipes])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteRecipe(deleteTarget.recipe.id)
      setRecipes((prev) => prev.filter((r) => r.recipe.id !== deleteTarget.recipe.id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete recipe.')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  function handleSaved(_recipeId: string) {
    setFormOpen(false)
    setEditingRecipe(null)
    void loadRecipes()
  }

  function openEdit(recipe: RecipeWithIngredients) {
    setEditingRecipe(recipe)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recipes"
        description="Bill-of-materials templates for menu items."
        actions={
          selectedBuId ? (
            <Button onClick={() => setFormOpen(true)}>+ New recipe</Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-2" aria-label="Loading recipes">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadRecipes()}>
            Retry
          </Button>
        </div>
      ) : recipes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">No recipes yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            {selectedBuId
              ? 'Create your first recipe to use it in sales.'
              : 'Select a business unit to see recipes.'}
          </p>
          {selectedBuId && (
            <Button size="sm" className="mt-3" onClick={() => setFormOpen(true)}>
              + New recipe
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {recipes.map((recipe) => {
            const margin = marginLabel(recipe.recipe.selling_price, recipe.recipe.estimated_cost)
            return (
            <li key={recipe.recipe.id}>
              <div
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-emerald-300 active:bg-slate-50"
                onClick={() => setDetailRecipe(recipe)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setDetailRecipe(recipe)
                  }
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[15px] font-bold text-slate-900">{recipe.recipe.name}</h3>
                      <Badge tone={recipe.recipe.active ? 'healthy' : 'neutral'} size="sm">
                        {recipe.recipe.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}
                      {recipe.recipe.selling_price && ` · Menu ₹${Number(recipe.recipe.selling_price).toFixed(0)}`}
                      {margin && <span className="font-semibold text-emerald-700"> · {margin}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(recipe)
                      }}
                      aria-label={`Edit ${recipe.recipe.name}`}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(recipe)
                      }}
                      className="min-h-[44px] min-w-[44px] text-red-700 hover:bg-red-50"
                      aria-label={`Delete ${recipe.recipe.name}`}
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </li>
            )
          })}
        </ul>
      )}

      {formOpen && (
        <RecipeFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false)
            setEditingRecipe(null)
          }}
          onSaved={handleSaved}
          initial={editingRecipe}
        />
      )}

      {detailRecipe && (
        <RecipeDetailModal
          onClose={() => setDetailRecipe(null)}
          recipe={detailRecipe}
          onEdit={(r) => {
            setDetailRecipe(null)
            openEdit(r)
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete recipe?"
        message={`Delete “${deleteTarget?.recipe.name ?? ''}”? This cannot be undone. Ingredients will be removed.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
