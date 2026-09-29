export type RoomStatus = 'free' | 'occupied'

export interface Room {
  id: string
  business_unit_id: string
  room_number: string
  status: RoomStatus
  active: boolean
  created_at: string
}

export interface RoomListResponse {
  rooms: Room[]
  total: number
}

export interface Stay {
  id: string
  business_unit_id: string
  room_id: string
  room_number: string
  guest_name: string
  status: 'open' | 'closed'
  checked_in_at: string
  checked_out_at: string | null
}

export interface StayListResponse {
  stays: Stay[]
  total: number
}

export interface StayChargeLine {
  item_name: string
  quantity: number
  unit_price: string
  line_total: string
}

export interface StayCharge {
  id: string
  sale_number: string
  items: StayChargeLine[]
  discount: string
  total_amount: string
  sold_at: string
  created_by_username: string | null
}

export interface StayBill {
  stay: Stay
  charges: StayCharge[]
  charges_total: string
  charge_count: number
}
