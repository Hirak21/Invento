import { apiFetch } from './api'
import type { MenuItem } from '@/types/recipe'

export function listMenuItems(businessUnitId: string): Promise<MenuItem[]> {
  return apiFetch<MenuItem[]>(`/menu-items?business_unit_id=${businessUnitId}`)
}
