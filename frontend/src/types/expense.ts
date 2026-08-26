export const EXPENSE_CATEGORIES = [
  { value: 'utilities', label: 'Utilities' },
  { value: 'transport', label: 'Transport' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'rent', label: 'Rent' },
  { value: 'other', label: 'Other' },
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value']

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export interface Expense {
  id: string
  expense_number: string
  business_unit_id: string
  category: ExpenseCategory
  amount: string
  payment_method: PaymentMethod
  payment_status: 'paid' | 'pending'
  description: string
  payee: string | null
  reference_number: string | null
  notes: string | null
  spent_at: string
  created_by_username: string | null
}

export interface ExpenseListResponse {
  records: Expense[]
  total: number
  total_amount: string
}

export function formatCategory(category: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category
}
