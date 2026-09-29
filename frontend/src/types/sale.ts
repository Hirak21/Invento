export type SalePaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'credit' | 'room_charge'

export interface SaleLine {
  item_id: string
  item_name: string
  quantity: number
  unit: string
  unit_price: string
  unit_cost: string | null
  line_total: string
}

export interface Sale {
  id: string
  sale_number: string
  business_unit_id: string
  items: SaleLine[]
  subtotal: string
  discount: string
  total_amount: string
  payment_method: SalePaymentMethod
  reference_number: string | null
  notes: string | null
  sold_at: string
  created_by_username: string | null
  recipe_id: string | null
  recipe_name: string | null
  stay_id: string | null
  room_number: string | null
}

export interface SaleListResponse {
  sales: Sale[]
  total: number
}
