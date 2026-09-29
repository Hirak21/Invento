import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { deleteRecipe, listRecipes } from '@/services/recipes'
import type { RecipeWithIngredients } from '@/types/recipe'
import { formatDate } from '@/types/inventory'

function ConfirmDeleteModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Card className="rounded-xl border border-red-200 bg-red-50 p-4">
      <h3 className="text-sm font-semibold text-red-800">Delete this recipe?</h3>
      <p className="mt-1 text-sm text-red-700">This cannot be undone. Ingredients will be removed.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} className="px-3">
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} className="px-3">
          Delete
        </Button>
      </div>
    </Card>
  )
}

function RecipeDetailModal({
  onClose,
  recipe,
}: {
  onClose: () => void
  recipe: RecipeWithIngredients | null
}) {
  if (!recipe) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40" aria-hidden="true" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-xl sm:max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{recipe.recipe.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {recipe.recipe.description && (
          <p className="mb-4 text-sm text-slate-600">{recipe.recipe.description}</p>
        )}
        <div className="mb-4 flex items-center gap-3 text-sm text-slate-500">
          <span>Created {formatDate(recipe.recipe.created_at)}</span>
          {recipe.recipe.updated_at !== recipe.recipe.created_at && (
            <span>Updated {formatDate(recipe.recipe.updated_at)}</span>
          )}
        </div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Ingredients ({recipe.ingredients.length})</h3>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-slate-500">No ingredients added yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="py-2 text-sm">
                <span className="font-medium text-slate-900">{ing.quantity} {ing.unit}</span>
                {' '}
                <span className="text-slate-700">{ing.item_name}</span>
                {ing.notes && (
                  <span className="ml-2 text-slate-400">— {ing.notes}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
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
    try {
      await deleteRecipe(deleteTarget.recipe.id)
      setRecipes((prev) => prev.filter((r) => r.recipe.id !== deleteTarget.recipe.id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete recipe.')
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Recipes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Bill-of-materials templates for menu items.
        </p>
      </div>

      {selectedBuId && (
        <div className="flex justify-end">
          <Button onClick={() => setFormOpen(true)}>+ New recipe</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="size-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <span className="ml-3 text-sm text-slate-500">Loading recipes…</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : recipes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm font-medium text-slate-500">No recipes yet.</p>
          <p className="mt-1 text-xs text-slate-400">
            {selectedBuId
              ? 'Create your first recipe to use it in sales.'
              : 'Select a business unit to see recipes.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {recipes.map((recipe) => (
            <div
              key={recipe.recipe.id}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-indigo-200"
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
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-900">{recipe.recipe.name}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      recipe.recipe.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {recipe.recipe.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {recipe.recipe.description && (
                    <p className="mt-0.5 truncate text-sm text-slate-500">{recipe.recipe.description}</p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    <span>{recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>Updated {formatDate(recipe.recipe.updated_at)}</span>
                  </div>
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
                    className="text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDeleteTarget(null)} />
          <Card className="relative w-full max-w-sm">
            <ConfirmDeleteModal
              onClose={() => setDeleteTarget(null)}
              onConfirm={handleDelete}
            />
          </Card>
        </div>
      )}
    </div>
  )
}

import { RecipeFormModal } from '@/features/recipes/RecipeFormModal'
