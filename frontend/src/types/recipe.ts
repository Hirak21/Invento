export interface Recipe {
  id: string
  name: string
  business_unit_id: string
  description: string | null
  active: boolean
  selling_price: string | null
  category_id: string | null
  estimated_cost: string | null
  created_at: string
  updated_at: string
}

export interface RecipeIngredient {
  id: string
  recipe_id: string
  item_id: string
  item_name: string
  /** Canonical quantity in the stock item's base unit. */
  quantity: number
  unit: string
  /** What was entered (for display); equals quantity/unit for legacy lines. */
  entered_quantity: number
  entered_unit: string
  notes: string | null
}

export interface RecipeWithIngredients {
  recipe: Recipe
  ingredients: RecipeIngredient[]
}

export interface MenuItem {
  id: string
  name: string
  type: 'recipe' | 'shop_product'
  recipe_id: string | null
  selling_price: string
  business_unit_id: string
  active: boolean
  created_at: string
  category: string | null
  available: boolean | null
  estimated_cost: string | null
  ingredient_summary?: { item_name: string; qty: number; unit: string; entered_qty?: number; entered_unit?: string }[]
}

export interface RecipeFilters {
  business_unit_id?: string
  active?: boolean
}

export function formatRecipeIngredient(ingredient: RecipeIngredient): string {
  return `${ingredient.quantity} ${ingredient.unit} ${ingredient.item_name}${ingredient.notes ? ` (${ingredient.notes})` : ''}`
}
