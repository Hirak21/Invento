export type ItemType = 'shop_product' | 'raw_material' | 'packaging' | 'other'
export type StockStatus = 'healthy' | 'low' | 'out'

export interface InventoryItem {
  id: string
  name: string
  sku: string | null
  category_id: string
  business_unit_id: string
  item_type: ItemType
  base_unit: string
  purchase_price: string
  selling_price: string | null
  min_stock_level: number
  current_stock: number
  supplier_id: string | null
  notes: string | null
  active: boolean
  status: StockStatus
  created_at: string
}

export interface ItemListResponse {
  items: InventoryItem[]
  total: number
}

export interface Movement {
  id: string
  item_id: string
  business_unit_id: string
  movement_type: string
  quantity: string
  unit: string
  unit_cost: string | null
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_by_username: string | null
  created_at: string
}

export interface MovementListResponse {
  movements: Movement[]
  total: number
}

export type StockAlertStatus = 'low' | 'out'

export interface StockAlert {
  item_id: string
  item_name: string
  current_stock: number
  min_stock_level: number
  base_unit: string
  suggested_reorder_qty: number
  status: StockAlertStatus
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  shop_product: 'Shop Product',
  raw_material: 'Raw Material',
  packaging: 'Packaging',
  other: 'Other',
}

export const UNITS = ['pcs', 'kg', 'g', 'litre', 'l', 'ml', 'box', 'packet'] as const

export function formatMoney(amount: string | null): string {
  if (amount === null) return '—'
  return `₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
