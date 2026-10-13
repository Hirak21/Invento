import { apiFetch } from './api'
import type { ExpenseCategoryInfo } from '@/types/expense'
import type { ExpenseCategory, Expense, PaymentMethod } from '@/types/expense'

export interface ServerExpenseCategory {
  slug: string
  name: string
  built_in: boolean
  active: boolean
}

export async function listExpenseCategories(): Promise<ExpenseCategoryInfo[]> {
  const cats = await apiFetch<ServerExpenseCategory[]>('/expenses/categories')
  return cats.map((c) => ({ value: c.slug, label: c.name, builtIn: c.built_in }))
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategoryInfo> {
  const cat = await apiFetch<ServerExpenseCategory>('/expenses/categories', {
    method: 'POST',
    body: { name },
  })
  return { value: cat.slug, label: cat.name }
}

export async function renameExpenseCategory(slug: string, name: string): Promise<ExpenseCategoryInfo> {
  const cat = await apiFetch<ServerExpenseCategory>(`/expenses/categories/${slug}`, {
    method: 'PATCH',
    body: { name },
  })
  return { value: cat.slug, label: cat.name }
}

export function deleteExpenseCategory(slug: string): Promise<void> {
  return apiFetch<void>(`/expenses/categories/${slug}`, { method: 'DELETE' })
}

export function listExpenses(filters: {
  business_unit_id?: string
  category?: string
  payment_method?: string
  payment_status?: 'paid' | 'pending'
  from?: string
  to?: string
} = {}): Promise<ExpenseListResponse> {
  const params = new URLSearchParams()
  if (filters.business_unit_id) params.set('business_unit_id', filters.business_unit_id)
  if (filters.category) params.set('category', filters.category)
  if (filters.payment_method) params.set('payment_method', filters.payment_method)
  if (filters.payment_status) params.set('payment_status', filters.payment_status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const qs = params.toString()
  return apiFetch(`/expenses${qs ? `?${qs}` : ''}`)
}

export function setExpensePaymentStatus(
  id: string,
  payment_status: 'paid' | 'pending',
): Promise<Expense> {
  return apiFetch<Expense>(`/expenses/${id}/payment-status`, {
    method: 'PATCH',
    body: { payment_status },
  })
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
