import { apiFetch } from './api'
import type { RecipeWithIngredients, RecipeFilters } from '@/types/recipe'

export function listRecipes(filters: RecipeFilters = {}): Promise<RecipeWithIngredients[]> {
  const params = new URLSearchParams()
  if (filters.business_unit_id) params.set('business_unit_id', filters.business_unit_id)
  if (filters.active !== undefined) params.set('active', String(filters.active))
  const qs = params.toString()
  return apiFetch<RecipeWithIngredients[]>(`/recipes${qs ? `?${qs}` : ''}`)
}

export function getRecipe(id: string): Promise<RecipeWithIngredients> {
  return apiFetch<RecipeWithIngredients>(`/recipes/${id}`)
}

export interface RecipeCreatePayload {
  name: string
  business_unit_id: string
  description?: string
  active?: boolean
  selling_price?: string | null
  category_id?: string | null
  ingredients?: { item_id: string; quantity: number; unit?: string; notes?: string }[]
}

/** Backend returns the full { recipe, ingredients } shape (not a bare recipe). */
export function createRecipe(payload: RecipeCreatePayload): Promise<RecipeWithIngredients> {
  return apiFetch<RecipeWithIngredients>('/recipes', { method: 'POST', body: payload })
}

export function updateRecipe(
  id: string,
  patch: {
    name?: string
    description?: string | null
    active?: boolean
    selling_price?: string | null
    category_id?: string | null
  },
): Promise<RecipeWithIngredients> {
  return apiFetch<RecipeWithIngredients>(`/recipes/${id}`, { method: 'PATCH', body: patch })
}

export function deleteRecipe(id: string): Promise<void> {
  return apiFetch<void>(`/recipes/${id}`, { method: 'DELETE' })
}

/** Backend returns the full recipe (with all ingredients), not a single line. */
export function addRecipeIngredient(
  recipeId: string,
  payload: {
    item_id: string
    quantity: number
    unit?: string
    notes?: string
  },
): Promise<RecipeWithIngredients> {
  return apiFetch<RecipeWithIngredients>(`/recipes/${recipeId}/ingredients`, {
    method: 'POST',
    body: payload,
  })
}

export function removeRecipeIngredient(recipeId: string, ingredientId: string): Promise<void> {
  return apiFetch<void>(`/recipes/${recipeId}/ingredients/${ingredientId}`, { method: 'DELETE' })
}

/** Units the backend accepts for an ingredient line on this stock item. */
export function getCompatibleUnits(itemId: string): Promise<{ item_id: string; compatible_units: string[] }> {
  return apiFetch<{ item_id: string; compatible_units: string[] }>(
    `/inventory/items/${itemId}/compatible-units`,
  )
}
