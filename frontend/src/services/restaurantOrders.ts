import { apiFetch } from './api'
import type { OrderStatus, Sale } from '@/types/sale'

export interface RestaurantOrderFilters {
  business_unit_id?: string
  status?: OrderStatus | 'active' | 'all'
  room?: string
}

/** Active orders for the restaurant board: not SERVED, not CANCELLED. */
export async function listRestaurantOrders(
  filters: RestaurantOrderFilters = {},
): Promise<{ orders: Sale[]; total: number }> {
  const search = new URLSearchParams()
  if (filters.business_unit_id) search.set('business_unit_id', filters.business_unit_id)
  search.set('status', filters.status ?? 'active')
  if (filters.room) search.set('room', filters.room)
  const qs = search.toString()
  // The sales endpoint returns { sales, total } - map to the board's shape.
  const res = await apiFetch<{ sales: Sale[]; total: number }>(`/sales?${qs}`)
  return { orders: res.sales ?? [], total: res.total ?? 0 }
}

/** Advance an order's status. Owner or staff; audited server-side. */
export function updateOrderStatus(saleId: string, status: OrderStatus): Promise<Sale> {
  return apiFetch<Sale>(`/sales/${saleId}/status`, { method: 'PATCH', body: { status } })
}

/** Cancel an order (restores stock once). Owner or staff before SERVED. */
export function cancelOrder(saleId: string): Promise<Sale> {
  return apiFetch<Sale>(`/sales/${saleId}`, { method: 'DELETE' })
}
