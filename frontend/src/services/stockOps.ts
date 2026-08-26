import { apiFetch } from './api'
import type {
  AdjustmentReason,
  AdjustmentRecord,
  WastageReason,
  WastageRecord,
} from '@/types/wastage'

export function listWastage(filters: {
  business_unit_id?: string
  item_id?: string
  from?: string
  to?: string
} = {}): Promise<{ records: WastageRecord[]; total: number }> {
  const params = new URLSearchParams()
  if (filters.business_unit_id) params.set('business_unit_id', filters.business_unit_id)
  if (filters.item_id) params.set('item_id', filters.item_id)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const qs = params.toString()
  return apiFetch(`/wastage${qs ? `?${qs}` : ''}`)
}

export function createWastage(body: {
  business_unit_id: string
  item_id: string
  quantity: number
  reason: WastageReason
  notes?: string | null
  date?: string
  idempotency_key: string
}): Promise<WastageRecord> {
  return apiFetch<WastageRecord>('/wastage', { method: 'POST', body })
}

export function createAdjustment(body: {
  business_unit_id: string
  item_id: string
  new_quantity: number
  reason: AdjustmentReason
  notes?: string | null
  date?: string
  idempotency_key: string
}): Promise<AdjustmentRecord> {
  return apiFetch<AdjustmentRecord>('/stock-adjustments', { method: 'POST', body })
}
