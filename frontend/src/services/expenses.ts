import { apiFetch } from './api'
import type { ExpenseCategory, Expense, PaymentMethod } from '@/types/expense'

export function listExpenses(filters: {
  business_unit_id?: string
  category?: string
  payment_method?: string
  from?: string
  to?: string
} = {}): Promise<ExpenseListResponse> {
  const params = new URLSearchParams()
  if (filters.business_unit_id) params.set('business_unit_id', filters.business_unit_id)
  if (filters.category) params.set('category', filters.category)
  if (filters.payment_method) params.set('payment_method', filters.payment_method)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const qs = params.toString()
  return apiFetch(`/expenses${qs ? `?${qs}` : ''}`)
}

export interface ExpenseListResponse {
  records: Expense[]
  total: number
  total_amount: string
}

export function createExpense(body: {
  business_unit_id: string
  category: ExpenseCategory
  amount: string
  payment_method: PaymentMethod
  payment_status?: 'paid' | 'pending'
  description: string
  payee?: string | null
  reference_number?: string | null
  notes?: string | null
  date?: string
  idempotency_key: string
}): Promise<Expense> {
  return apiFetch<Expense>('/expenses', { method: 'POST', body })
}
