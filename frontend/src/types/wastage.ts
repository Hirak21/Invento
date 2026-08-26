export const WASTAGE_REASONS = [
  { value: 'spoiled', label: 'Spoiled' },
  { value: 'expired', label: 'Expired' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'cooking_loss', label: 'Cooking/handling loss' },
  { value: 'other', label: 'Other' },
] as const

export type WastageReason = (typeof WASTAGE_REASONS)[number]['value']

export interface WastageRecord {
  id: string
  business_unit_id: string
  item_id: string
  item_name: string
  quantity: number
  unit: string
  reason: WastageReason
  estimated_value: string
  notes: string | null
  wasted_at: string
  created_by_username: string | null
}

export interface WastageListResponse {
  records: WastageRecord[]
  total: number
}

export const ADJUSTMENT_REASONS = [
  { value: 'physical_count', label: 'Physical count correction' },
  { value: 'damaged_found', label: 'Damaged found during count' },
  { value: 'expired_found', label: 'Expired found during count' },
  { value: 'data_entry_error', label: 'Data entry error' },
  { value: 'other', label: 'Other' },
] as const

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]['value']

export interface AdjustmentRecord {
  id: string
  business_unit_id: string
  item_id: string
  item_name: string
  previous_quantity: number
  new_quantity: number
  delta: number
  unit: string
  reason: AdjustmentReason
  notes: string | null
  adjusted_at: string
  created_by_username: string | null
}

export function formatReason(reason: string): string {
  return (
    [...WASTAGE_REASONS, ...ADJUSTMENT_REASONS].find((r) => r.value === reason)?.label ??
    reason.replace(/_/g, ' ')
  )
}
