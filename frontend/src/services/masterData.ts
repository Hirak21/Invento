import { apiFetch } from './api'
import type { BusinessUnit, Category, Supplier } from '@/types/master'
import type {
  InventoryItem,
  ItemListResponse,
  ItemType,
  MovementListResponse,
} from '@/types/inventory'

// ---------- Business units ----------

export function listBusinessUnits(): Promise<BusinessUnit[]> {
  return apiFetch<BusinessUnit[]>('/business-units')
}

export function createBusinessUnit(
  name: string,
  location?: string,
  unit_type?: 'restaurant' | 'retail',
): Promise<BusinessUnit> {
  return apiFetch<BusinessUnit>('/business-units', {
    method: 'POST',
    body: { name, location: location || null, unit_type: unit_type ?? 'retail' },
  })
}

export function updateBusinessUnit(
  id: string,
  patch: { name?: string; location?: string | null; active?: boolean; unit_type?: 'restaurant' | 'retail' },
): Promise<BusinessUnit> {
  return apiFetch<BusinessUnit>(`/business-units/${id}`, { method: 'PATCH', body: patch })
}

// ---------- Categories ----------

export function listCategories(includeInactive = false): Promise<Category[]> {
  return apiFetch<Category[]>(
    `/categories${includeInactive ? '?include_inactive=true' : ''}`,
  )
}

export function createCategory(name: string): Promise<Category> {
  return apiFetch<Category>('/categories', { method: 'POST', body: { name } })
}

export function updateCategory(
  id: string,
  patch: { name?: string; active?: boolean },
): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}`, { method: 'PATCH', body: patch })
}

// ---------- Suppliers ----------

export function listSuppliers(includeInactive = false): Promise<Supplier[]> {
  return apiFetch<Supplier[]>(`/suppliers${includeInactive ? '?include_inactive=true' : ''}`)
}

export function createSupplier(body: {
  name: string
  phone?: string
  notes?: string
}): Promise<Supplier> {
  return apiFetch<Supplier>('/suppliers', { method: 'POST', body })
}

export function updateSupplier(
  id: string,
  patch: { name?: string; phone?: string | null; notes?: string | null; active?: boolean },
): Promise<Supplier> {
  return apiFetch<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: patch })
}

// ---------- Inventory items ----------

export interface ItemFilters {
  business_unit_id?: string
  category_id?: string
  supplier_id?: string
  search?: string
  status?: string
  include_inactive?: boolean
}

export function listItems(filters: ItemFilters = {}): Promise<ItemListResponse> {
  const params = new URLSearchParams()
  if (filters.business_unit_id) params.set('business_unit_id', filters.business_unit_id)
  if (filters.category_id) params.set('category_id', filters.category_id)
  if (filters.supplier_id) params.set('supplier_id', filters.supplier_id)
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.include_inactive) params.set('include_inactive', 'true')
  const qs = params.toString()
  return apiFetch<ItemListResponse>(`/inventory/items${qs ? `?${qs}` : ''}`)
}

export interface ItemCreatePayload {
  name: string
  sku?: string
  category_id: string
  business_unit_id: string
  item_type: ItemType
  base_unit: string
  purchase_price: string
  selling_price?: string | null
  min_stock_level: number
  opening_stock: number
  supplier_id?: string | null
  notes?: string | null
}

export function createItem(payload: ItemCreatePayload): Promise<InventoryItem> {
  return apiFetch<InventoryItem>('/inventory/items', { method: 'POST', body: payload })
}

export function updateItem(
  id: string,
  patch: Partial<Omit<ItemCreatePayload, 'opening_stock'> & { active: boolean; business_unit_id?: string; base_unit?: string }>,
): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/inventory/items/${id}`, { method: 'PATCH', body: patch })
}

export function listItemMovements(id: string): Promise<MovementListResponse> {
  return apiFetch<MovementListResponse>(`/inventory/items/${id}/movements`)
}

export function deleteItem(id: string): Promise<void> {
  return apiFetch<void>(`/inventory/items/${id}`, { method: 'DELETE' })
}
