export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'credit'
export type PaymentStatus = 'paid' | 'pending'

export interface PurchaseLine {
  item_id: string
  item_name: string
  quantity: number
  unit: string
  unit_cost: string
  standard_purchase_price?: string | null
  line_total: string
}

export interface Purchase {
  id: string
  purchase_number: string
  business_unit_id: string
  supplier_id: string | null
  supplier_name: string | null
  items: PurchaseLine[]
  total_amount: string
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  reference_number: string | null
  notes: string | null
  purchased_at: string
  created_by_username: string | null
}

export interface PurchaseListResponse {
  purchases: Purchase[]
  total: number
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
]

export function formatPaymentMethod(method: PaymentMethod): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method
}
