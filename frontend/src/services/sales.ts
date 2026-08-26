import { apiFetch } from './api'
import type { SalePaymentMethod } from '@/types/sale'
import type { Sale, SaleListResponse } from '@/types/sale'

export interface SaleFilters {
  business_unit_id?: string
  from?: string
  to?: string
}

export function listSales(filters: SaleFilters = {}): Promise<SaleListResponse> {
  const params = new URLSearchParams()
  if (filters.business_unit_id) params.set('business_unit_id', filters.business_unit_id)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const qs = params.toString()
  return apiFetch<SaleListResponse>(`/sales${qs ? `?${qs}` : ''}`)
}

export function createSale(body: {
  business_unit_id: string
  items: { item_id: string; quantity: number; unit_price: string }[]
  discount?: string | null
  payment_method: SalePaymentMethod
  reference_number?: string | null
  notes?: string | null
  date?: string
  idempotency_key: string
}): Promise<Sale> {
  return apiFetch<Sale>('/sales', { method: 'POST', body })
}
