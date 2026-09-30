export type Period = 'today' | '7d' | 'month' | 'custom'

export interface DashboardSummary {
  period: { from: string; to: string }
  totals: {
    sales: string
    purchases: string
    expenses: string
    wastage: string
    sale_count: number
    inventory_value: string
    net_balance: string
  }
  business_split: {
    business_unit_id: string
    name: string
    sales: string
    purchases: string
    expenses: string
  }[]
  low_stock: {
    item_id: string
    item_name: string
    current_stock: number
    min_stock_level: number
    base_unit: string
    status: 'low' | 'out'
  }[]
  recent_activity: {
    type: 'sale' | 'purchase' | 'expense' | 'wastage'
    number: string
    label: string
    amount: string
    at: string
  }[]
  top_selling: {
    item_id: string
    item_name: string
    quantity_sold: number
    revenue: string
  }[]
  sales_trend: { date: string; total: string; count: number }[]
}

export function fetchSummary(params: {
  period: Period
  from?: string
  to?: string
  business_unit_id?: string
}): Promise<DashboardSummary> {
  const search = new URLSearchParams({ period: params.period })
  if (params.period === 'custom') {
    search.set('from', params.from ?? '')
    search.set('to', params.to ?? '')
  }
  if (params.business_unit_id) search.set('business_unit_id', params.business_unit_id)
  // JS getTimezoneOffset is minutes *behind* UTC (IST → -330); API wants +330.
  search.set('tz_offset_minutes', String(-new Date().getTimezoneOffset()))
  return apiFetchDashboard(search)
}

import { apiFetch } from './api'

function apiFetchDashboard(search: URLSearchParams): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>(`/dashboard/summary?${search.toString()}`)
}
