export interface BusinessUnit {
  id: string
  name: string
  location: string | null
  active: boolean
  created_at: string
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
