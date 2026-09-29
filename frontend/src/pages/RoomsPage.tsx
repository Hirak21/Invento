import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { checkIn, checkoutStay, createRoom, getStayBill, listRooms, listStays } from '@/services/rooms'
import type { Room, StayBill } from '@/types/room'
import type { Stay } from '@/types/room'

function formatMoney(value: string): string {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function hoursSince(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`
  return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`
}

const SETTLEMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
]

export function RoomsPage() {
  const { selectedBuId } = useBusinessUnit()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // check-in flow
  const [checkInRoom, setCheckInRoom] = useState<Room | null>(null)
  const [guestName, setGuestName] = useState('')
  const [checkInPending, setCheckInPending] = useState(false)

  // add room flow
  const [addOpen, setAddOpen] = useState(false)
  const [newRoomNumber, setNewRoomNumber] = useState('')
  const [addPending, setAddPending] = useState(false)

  // bill modal
  const [bill, setBill] = useState<StayBill | null>(null)
  const [billLoading, setBillLoading] = useState(false)
  const [checkoutMethod, setCheckoutMethod] = useState('cash')
  const [checkoutPending, setCheckoutPending] = useState(false)

  // recent + open stays
  const [recentStays, setRecentStays] = useState<Stay[]>([])
  const [openStayByRoom, setOpenStayByRoom] = useState<Map<string, Stay>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [roomsRes, staysRes] = await Promise.all([
        listRooms({ business_unit_id: selectedBuId ?? undefined }),
        listStays({ business_unit_id: selectedBuId ?? undefined }),
      ])
      setRooms(roomsRes.rooms)
      const open = new Map<string, Stay>()
      for (const stay of staysRes.stays) {
        if (stay.status === 'open') open.set(stay.room_id, stay)
      }
      setOpenStayByRoom(open)
      setRecentStays(staysRes.stays.filter((s) => s.status === 'closed').slice(0, 5))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load rooms.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId])

  useEffect(() => {
    void load()
  }, [load])

  async function openBill(stayId: string) {
    setBillLoading(true)
    try {
      const data = await getStayBill(stayId)
      setBill(data)
      setCheckoutMethod('cash')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the bill.')
    } finally {
      setBillLoading(false)
    }
  }

  async function handleCheckIn() {
    if (!checkInRoom) return
    if (!guestName.trim()) {
      setError('Enter the guest name to check in.')
      return
    }
    setCheckInPending(true)
    setError(null)
    try {
      await checkIn({ room_id: checkInRoom.id, guest_name: guestName.trim() })
      setCheckInRoom(null)
      setGuestName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed.')
    } finally {
      setCheckInPending(false)
    }
  }

  async function handleAddRoom() {
    if (!newRoomNumber.trim()) {
      setError('Enter a room number.')
      return
    }
    const buId = selectedBuId
    if (!buId) {
      setError('Select a business unit for the room first (top bar).')
      return
    }
    setAddPending(true)
    setError(null)
    try {
      await createRoom({ business_unit_id: buId, room_number: newRoomNumber.trim() })
      setNewRoomNumber('')
      setAddOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the room.')
    } finally {
      setAddPending(false)
    }
  }

  async function handleCheckout() {
    if (!bill) return
    setCheckoutPending(true)
    setError(null)
    try {
      await checkoutStay(bill.stay.id, checkoutMethod)
      setBill(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.')
    } finally {
      setCheckoutPending(false)
    }
  }

  const openStaysByRoom = openStayByRoom

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rooms</h1>
          <p className="mt-1 text-sm text-slate-500">
            Check guests in, charge restaurant orders to their room, settle the bill at checkout.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} variant="secondary">
          + Add room
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <EmptyState message="No rooms yet. Add room numbers to start charging orders to rooms." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rooms.map((room) => (
            <Card key={room.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-slate-900">Room {room.room_number}</p>
                  <Badge tone={room.status === 'occupied' ? 'out' : 'healthy'}>{room.status}</Badge>
                </div>
              </div>
              {room.status === 'free' ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setCheckInRoom(room)
                    setGuestName('')
                    setError(null)
                  }}
                >
                  Check in
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setError(null)
                    const stay = openStaysByRoom.get(room.id)
                    if (stay) void openBill(stay.id)
                  }}
                >
                  View bill · Check out
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {recentStays.length > 0 && (
        <Card title="Recent checkouts">
          <ul className="divide-y divide-slate-100">
            {recentStays.map((stay) => (
              <li key={stay.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="font-medium text-slate-800">
                  Room {stay.room_number} · {stay.guest_name}
                </span>
                <span className="text-slate-500">
                  {formatDateTime(stay.checked_in_at)} → {formatDateTime(stay.checked_out_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Check-in modal */}
      <Modal open={!!checkInRoom} title={checkInRoom ? `Check in — Room ${checkInRoom.room_number}` : ''} onClose={() => setCheckInRoom(null)}>
        <div className="space-y-4">
          <Input
            label="Guest name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="e.g. Sharma"
            autoComplete="off"
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCheckInRoom(null)}>
              Cancel
            </Button>
            <Button pending={checkInPending} onClick={() => void handleCheckIn()}>
              Check in
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add room modal */}
      <Modal open={addOpen} title="Add room" onClose={() => setAddOpen(false)}>
        <div className="space-y-4">
          <Input
            label="Room number"
            value={newRoomNumber}
            onChange={(e) => setNewRoomNumber(e.target.value)}
            placeholder="e.g. 101"
            autoComplete="off"
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button pending={addPending} onClick={() => void handleAddRoom()}>
              Add room
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bill modal */}
      <Modal
        open={!!bill}
        title={bill ? `Bill — Room ${bill.stay.room_number} · ${bill.stay.guest_name}` : ''}
        onClose={() => setBill(null)}
        wide
      >
        {bill && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Checked in {formatDateTime(bill.stay.checked_in_at)} · {hoursSince(bill.stay.checked_in_at)} on premises
            </p>
            {bill.charges.length === 0 ? (
              <EmptyState message="No room charges yet. Restaurant orders charged to this room will appear here." />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {bill.charges.map((charge) => (
                  <li key={charge.id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{charge.sale_number}</span>
                      <span className="font-semibold text-slate-900">{formatMoney(charge.total_amount)}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {charge.items.map((line, idx) => (
                        <li key={idx}>
                          {line.quantity} × {line.item_name} — {formatMoney(line.line_total)}
                        </li>
                      ))}
                    </ul>
                    <span className="text-xs text-slate-400">{formatDateTime(charge.sold_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-base font-semibold text-slate-900">Total to settle</span>
              <span className="text-xl font-bold text-slate-900">{formatMoney(bill.charges_total)}</span>
            </div>
            <div className="flex flex-wrap items-end justify-end gap-3">
              <Select
                label=""
                value={checkoutMethod}
                onChange={(e) => setCheckoutMethod(e.target.value)}
                aria-label="Settlement method"
                className="w-44"
              >
                {SETTLEMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    Settle via {m.label}
                  </option>
                ))}
              </Select>
              <Button pending={checkoutPending} onClick={() => void handleCheckout()}>
                Settle &amp; check out
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {billLoading && <p className="text-xs text-slate-400">Loading bill…</p>}
    </div>
  )
}

