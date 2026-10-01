export type UnitType = 'restaurant' | 'retail'

export interface BusinessUnit {
  id: string
  name: string
  location: string | null
  active: boolean
  unit_type: UnitType
  created_at: string
}

/** POS default tab: food units open on Menu, shops on Items. No name checks. */
export function defaultMenuTab(unit: BusinessUnit | undefined): 'menu' | 'items' {
  return unit?.unit_type === 'restaurant' ? 'menu' : 'items'
}

export interface Category {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  phone: string | null
  notes: string | null
  active: boolean
  created_at: string
}
