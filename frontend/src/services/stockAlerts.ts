import { apiFetch } from './api'

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

export async function listStockAlerts(filters?: {
  business_unit_id?: string
  include_out_of_stock?: boolean
}): Promise<StockAlert[]> {
  const params = new URLSearchParams()
  if (filters?.business_unit_id) params.set('business_unit_id', filters.business_unit_id)
  if (filters?.include_out_of_stock === false) params.set('include_out_of_stock', 'false')
  return apiFetch<StockAlert[]>(`/stock-alerts?${params.toString()}`)
}
