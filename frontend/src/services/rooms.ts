import { apiFetch } from './api'
import type { Room, RoomListResponse, Stay, StayBill, StayListResponse } from '@/types/room'

export function listRooms(params: { business_unit_id?: string; status?: 'free' | 'occupied' } = {}): Promise<RoomListResponse> {
  const search = new URLSearchParams()
  if (params.business_unit_id) search.set('business_unit_id', params.business_unit_id)
  if (params.status) search.set('status', params.status)
  const qs = search.toString()
  return apiFetch<RoomListResponse>(`/rooms${qs ? `?${qs}` : ''}`)
}

export function createRoom(body: { business_unit_id: string; room_number: string }): Promise<Room> {
  return apiFetch<Room>('/rooms', { method: 'POST', body })
}

export function updateRoom(
  roomId: string,
  body: { room_number?: string; active?: boolean },
): Promise<Room> {
  return apiFetch<Room>(`/rooms/${roomId}`, { method: 'PATCH', body })
}

export function checkIn(body: { room_id: string; guest_name: string }): Promise<Stay> {
  return apiFetch<Stay>('/rooms/stays/check-in', { method: 'POST', body })
}

export function listStays(
  params: { business_unit_id?: string; status?: 'open' | 'closed' } = {},
): Promise<StayListResponse> {
  const search = new URLSearchParams()
  if (params.business_unit_id) search.set('business_unit_id', params.business_unit_id)
  if (params.status) search.set('status', params.status)
  const qs = search.toString()
  return apiFetch<StayListResponse>(`/rooms/stays${qs ? `?${qs}` : ''}`)
}

export function getStayBill(stayId: string): Promise<StayBill> {
  return apiFetch<StayBill>(`/rooms/stays/${stayId}/bill`)
}

export function checkoutStay(stayId: string, paymentMethod: string): Promise<Stay> {
  return apiFetch<Stay>(
    `/rooms/stays/${stayId}/checkout?payment_method=${encodeURIComponent(paymentMethod)}`,
    { method: 'POST' },
  )
}
