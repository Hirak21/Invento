import { apiFetch } from './api'
import type { Recipe, RecipeWithIngredients, RecipeFilters } from '@/types/recipe'

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

export function createRecipe(payload: {
  name: string
  business_unit_id: string
  description?: string
  active?: boolean
}): Promise<Recipe> {
  return apiFetch<Recipe>('/recipes', { method: 'POST', body: payload })
}

export function updateRecipe(id: string, patch: Partial<Pick<Recipe, 'name' | 'description' | 'active'>>): Promise<Recipe> {
  return apiFetch<Recipe>(`/recipes/${id}`, { method: 'PATCH', body: patch })
}

export function deleteRecipe(id: string): Promise<void> {
  return apiFetch<void>(`/recipes/${id}`, { method: 'DELETE' })
}

export function addRecipeIngredient(recipeId: string, payload: {
  item_id: string
  quantity: number
  notes?: string
}): Promise<{ id: string; recipe_id: string; item_id: string; item_name: string; quantity: number; unit: string; notes: string | null }> {
  return apiFetch<{ id: string; recipe_id: string; item_id: string; item_name: string; quantity: number; unit: string; notes: string | null }>(`/recipes/${recipeId}/ingredients`, { method: 'POST', body: payload })
}

export function removeRecipeIngredient(recipeId: string, ingredientId: string): Promise<void> {
  return apiFetch<void>(`/recipes/${recipeId}/ingredients/${ingredientId}`, { method: 'DELETE' })
}
