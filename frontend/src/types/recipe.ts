export interface Recipe {
  id: string
  name: string
  business_unit_id: string
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface RecipeIngredient {
  id: string
  recipe_id: string
  item_id: string
  item_name: string
  quantity: number
  unit: string
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
  ingredient_summary?: { item_name: string; qty: number; unit: string }[]
}

export interface RecipeFilters {
  business_unit_id?: string
  active?: boolean
}

export function formatRecipeIngredient(ingredient: RecipeIngredient): string {
  return `${ingredient.quantity} ${ingredient.unit} ${ingredient.item_name}${ingredient.notes ? ` (${ingredient.notes})` : ''}`
}
