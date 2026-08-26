import { apiFetch } from './api'
import type { PaymentMethod, PaymentStatus, Purchase, PurchaseListResponse } from '@/types/purchase'

export interface PurchaseFilters {
  business_unit_id?: string
  supplier_id?: string
  from?: string
  to?: string
}

export function listPurchases(filters: PurchaseFilters = {}): Promise<PurchaseListResponse> {
  const params = new URLSearchParams()
  if (filters.business_unit_id) params.set('business_unit_id', filters.business_unit_id)
  if (filters.supplier_id) params.set('supplier_id', filters.supplier_id)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const qs = params.toString()
  return apiFetch<PurchaseListResponse>(`/purchases${qs ? `?${qs}` : ''}`)
}

export interface PurchaseLinePayload {
  item_id: string
  quantity: number
  unit_cost: string
}

export function createPurchase(body: {
  business_unit_id: string
  supplier_id?: string | null
  items: PurchaseLinePayload[]
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  reference_number?: string | null
  notes?: string | null
  date?: string
  idempotency_key: string
}): Promise<Purchase> {
  return apiFetch<Purchase>('/purchases', { method: 'POST', body })
}

export function getPurchase(id: string): Promise<Purchase> {
  return apiFetch<Purchase>(`/purchases/${id}`)
}
