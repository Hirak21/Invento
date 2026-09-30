import { useCallback, useEffect, useState } from 'react'

import { RestaurantOrderSheet } from '@/features/restaurant/RestaurantOrderSheet'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select, StatusBadge } from '@/components/ui/Select'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { checkIn, checkoutStay, createRoom, getStayBill, listRooms, listStays } from '@/services/rooms'
import { cancelOrder, listRestaurantOrders, updateOrderStatus } from '@/services/restaurantOrders'
import type { OrderStatus, Sale } from '@/types/sale'
import type { Room, StayBill } from '@/types/room'
import type { Stay } from '@/types/room'
import { cn } from '@/utils/cn'

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

function orderElapsed(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function nextActionLabel(status?: OrderStatus): string {
  if (status === 'PENDING') return 'Start preparing'
  if (status === 'PREPARING') return 'Mark ready'
  return 'Mark served'
}

const SETTLEMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
]

export function RoomsPage() {
  const { selectedBuId, units, buStatus, buError, refreshUnits, setSelectedBuId } = useBusinessUnit()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // check-in flow
  const [checkInRoom, setCheckInRoom] = useState<Room | null>(null)
  const [guestName, setGuestName] = useState('')
  const [checkInPending, setCheckInPending] = useState(false)

  // add room flow — explicit unit picker so All-units context never blocks creation
  const [addOpen, setAddOpen] = useState(false)
  const [newRoomNumber, setNewRoomNumber] = useState('')
  const [addBuId, setAddBuId] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addPending, setAddPending] = useState(false)

  // room detail sheet (tap a room)
  const [detailRoom, setDetailRoom] = useState<Room | null>(null)
  // restaurant order sheet (room → menu → send)
  const [orderSheetOpen, setOrderSheetOpen] = useState(false)
  const [orderStayId, setOrderStayId] = useState<string | null>(null)
  const [detailBill, setDetailBill] = useState<StayBill | null>(null)
  const [detailBillLoading, setDetailBillLoading] = useState(false)

  // bill modal
  const [bill, setBill] = useState<StayBill | null>(null)
  const [billLoading, setBillLoading] = useState(false)
  const [checkoutMethod, setCheckoutMethod] = useState('cash')
  const [checkoutPending, setCheckoutPending] = useState(false)

  // recent + open stays
  const [recentStays, setRecentStays] = useState<Stay[]>([])
  const [openStayByRoom, setOpenStayByRoom] = useState<Map<string, Stay>>(new Map())
  // current unsettled total per open stay (room card balance)
  const [billTotals, setBillTotals] = useState<Record<string, string>>({})

  // live order board
  const [orders, setOrders] = useState<Sale[]>([])
  const [ordersBusy, setOrdersBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (buStatus === 'validating') return
    setLoading(true)
    setError(null)
    try {
      const buParam = selectedBuId ?? undefined
      const [roomsRes, staysRes, ordersRes] = await Promise.all([
        listRooms({ business_unit_id: buParam }),
        listStays({ business_unit_id: buParam }),
        listRestaurantOrders({ business_unit_id: buParam, status: 'active' }),
      ])
      setRooms(roomsRes.rooms)
      const open = new Map<string, Stay>()
      for (const stay of staysRes.stays) {
        if (stay.status === 'open') open.set(stay.room_id, stay)
      }
      setOpenStayByRoom(open)
      setRecentStays(staysRes.stays.filter((s) => s.status === 'closed').slice(0, 5))
      setOrders(ordersRes.orders)
      // Balances: best-effort per open stay, never fail the page.
      const totals: Record<string, string> = {}
      await Promise.all(
        [...open.values()].map(async (stay) => {
          try {
            const b = await getStayBill(stay.id)
            totals[stay.id] = b.charges_total
          } catch {
            /* leave balance blank for this room */
          }
        }),
      )
      setBillTotals(totals)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load rooms.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId, buStatus])

  useEffect(() => {
    void load()
  }, [load])

  // Keep the Add dialog's unit in sync with context when it opens.
  useEffect(() => {
    if (!addOpen) return
    setAddBuId(selectedBuId ?? units[0]?.id ?? '')
    setAddError(null)
  }, [addOpen, selectedBuId, units])

  function handleRetry() {
    refreshUnits()
    void load()
  }

  const invalidStoredUnit =
    buStatus === 'ready' && selectedBuId !== null && units.length > 0 && !units.some((u) => u.id === selectedBuId)

  // Load charges preview when the detail sheet opens on an occupied room.
  useEffect(() => {
    if (!detailRoom || detailRoom.status !== 'occupied') {
      setDetailBill(null)
      return
    }
    const stay = openStayByRoom.get(detailRoom.id)
    if (!stay) {
      setDetailBill(null)
      return
    }
    let cancelled = false
    setDetailBillLoading(true)
    getStayBill(stay.id)
      .then((b) => {
        if (!cancelled) setDetailBill(b)
      })
      .catch(() => {
        if (!cancelled) setDetailBill(null)
      })
      .finally(() => {
        if (!cancelled) setDetailBillLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailRoom, openStayByRoom])

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
      setDetailRoom(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed.')
    } finally {
      setCheckInPending(false)
    }
  }

  async function handleAddRoom() {
    if (!newRoomNumber.trim()) {
      setAddError('Enter a room number.')
      return
    }
    const buId = addBuId || selectedBuId || units[0]?.id
    if (!buId) {
      setAddError('No business unit available. Add one in Settings first, then try again.')
      return
    }
    setAddPending(true)
    setAddError(null)
    setError(null)
    try {
      await createRoom({ business_unit_id: buId, room_number: newRoomNumber.trim() })
      setNewRoomNumber('')
      setAddOpen(false)
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add the room.'
      setAddError(msg)
      // Surface unit-context conflicts at page level too so they aren't silent.
      if (msg.toLowerCase().includes('business unit')) setError(msg)
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
      setDetailRoom(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.')
    } finally {
      setCheckoutPending(false)
    }
  }

  async function handleAdvance(sale: Sale) {
    if (!sale.order_status) return
    const flow: Partial<Record<OrderStatus, OrderStatus>> = {
      PENDING: 'PREPARING',
      PREPARING: 'READY',
      READY: 'SERVED',
    }
    const next = flow[sale.order_status]
    if (!next) return
    setOrdersBusy(sale.id)
    setError(null)
    try {
      await updateOrderStatus(sale.id, next)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the order.')
    } finally {
      setOrdersBusy(null)
    }
  }

  async function handleCancel(sale: Sale) {
    setOrdersBusy(sale.id)
    setError(null)
    try {
      await cancelOrder(sale.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the order.')
    } finally {
      setOrdersBusy(null)
    }
  }

  const occupied = rooms.filter((r) => r.status === 'occupied').length
  const detailStay = detailRoom ? openStayByRoom.get(detailRoom.id) ?? null : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rooms</h1>
          <p className="mt-0.5 text-sm font-medium text-slate-600">
            {loading ? 'Loading…' : rooms.length === 0 ? 'No rooms yet' : `${occupied}/${rooms.length} occupied`}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setAddOpen(true)}>
          + Add room
        </Button>
      </div>

      {invalidStoredUnit && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            The saved business unit is no longer available. Showing all units instead.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setSelectedBuId(null)}>
            Reset to All units
          </Button>
        </div>
      )}

      {buStatus === 'error' && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{buError ?? 'Could not load business units.'}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      )}

      {/* ROOM STATE FIRST — tappable operational cards */}
      <section aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          Room status
        </h2>
        {buStatus === 'validating' || loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Loading rooms">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-28 rounded-2xl" />
            ))}
          </div>
        ) : error && rooms.length === 0 ? (
          <Card>
            <p className="text-center text-sm font-semibold text-slate-900">Could not load rooms.</p>
            <p className="mt-0.5 text-center text-xs text-slate-500">
              Check your connection or business unit, then retry.
            </p>
            <div className="mt-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          </Card>
        ) : rooms.length === 0 ? (
          <EmptyState
            title="No rooms yet"
            description={
              selectedBuId
                ? 'No rooms in this unit yet. Add room numbers to start charging orders to rooms.'
                : 'No rooms yet across all units. Add room numbers to start charging orders to rooms.'
            }
            action={<Button onClick={() => setAddOpen(true)}>+ Add room</Button>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {rooms.map((room) => {
              const stay = openStayByRoom.get(room.id)
              const balance = stay ? billTotals[stay.id] : undefined
              const isOccupied = room.status === 'occupied'
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setDetailRoom(room)}
                  aria-label={`Room ${room.room_number}, ${isOccupied ? `occupied by ${stay?.guest_name ?? 'guest'}` : 'available'}`}
                  className={cn(
                    'min-h-[112px] rounded-2xl border-2 bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50',
                    isOccupied ? 'border-slate-200' : 'border-emerald-200',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xl font-bold tabular-nums text-slate-900">{room.room_number}</span>
                    <span
                      aria-hidden="true"
                      className={cn('h-3 w-3 shrink-0 rounded-full', isOccupied ? 'bg-red-500' : 'bg-emerald-500')}
                    />
                  </span>
                  <span className={cn('mt-0.5 block text-xs font-bold', isOccupied ? 'text-red-700' : 'text-emerald-700')}>
                    {isOccupied ? 'Occupied' : 'Available'}
                  </span>
                  {isOccupied ? (
                    <>
                      <span className="mt-1 block truncate text-sm font-semibold text-slate-900">
                        {stay?.guest_name ?? 'Guest'}
                      </span>
                      <span className="mt-0.5 block text-sm font-bold tabular-nums text-slate-900">
                        {balance !== undefined ? formatMoney(balance) : '···'}
                      </span>
                    </>
                  ) : (
                    <span className="mt-1 block text-sm font-medium text-slate-500">Tap to check in</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* ACTIVE KITCHEN WORK — below rooms, one clear next action per order */}
      <section aria-labelledby="orders-heading">
        <h2 id="orders-heading" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          Active orders ({orders.length})
        </h2>
        {loading ? (
          <div className="space-y-2" aria-label="Loading orders">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-32 rounded-2xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="Kitchen is clear"
            description="New restaurant orders appear here instantly."
            action={
              <Button
                onClick={() => {
                  setOrderStayId(null)
                  setOrderSheetOpen(true)
                }}
              >
                New order
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {orders.map((order) => (
              <Card key={order.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900">
                      {order.room_number ? `Room ${order.room_number}` : 'Walk-in'}
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      {order.sale_number} · {orderElapsed(order.sold_at)} ago
                    </p>
                  </div>
                  {order.order_status && <StatusBadge status={order.order_status} />}
                </div>
                <ul className="space-y-1">
                  {order.items.map((line, idx) => (
                    <li key={idx} className="text-sm font-medium text-slate-900">
                      {line.item_name} <span className="font-bold tabular-nums">×{line.quantity}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-base font-bold tabular-nums text-slate-900">
                  ₹{Number(order.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                {order.order_status && order.order_status !== 'SERVED' && order.order_status !== 'CANCELLED' && (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      pending={ordersBusy === order.id}
                      onClick={() => void handleAdvance(order)}
                    >
                      {nextActionLabel(order.order_status)}
                    </Button>
                    <Button
                      variant="ghost"
                      pending={ordersBusy === order.id}
                      onClick={() => void handleCancel(order)}
                      aria-label={`Cancel order ${order.sale_number}`}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {recentStays.length > 0 && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            Recent checkouts
          </h2>
          <Card padding="none" className="divide-y divide-slate-100 overflow-hidden">
            {recentStays.map((stay) => (
              <div key={stay.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm font-semibold text-slate-900">
                  Room {stay.room_number} · {stay.guest_name}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {formatDateTime(stay.checked_in_at)} → {formatDateTime(stay.checked_out_at)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* ROOM DETAIL — guest, stay, charges, total, next action */}
      <BottomSheet
        open={!!detailRoom}
        onClose={() => {
          setDetailRoom(null)
          setDetailBill(null)
        }}
        title={detailRoom ? `Room ${detailRoom.room_number}` : 'Room'}
        action={
          detailRoom?.status === 'free' ? (
            <Button
              fullWidth
              size="lg"
              onClick={() => {
                if (!detailRoom) return
                setCheckInRoom(detailRoom)
                setGuestName('')
                setError(null)
              }}
            >
              Check in guest
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setOrderStayId(detailStay ? detailStay.id : null)
                  setDetailRoom(null)
                  setDetailBill(null)
                  setOrderSheetOpen(true)
                }}
              >
                New order
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  if (!detailStay) return
                  setDetailRoom(null)
                  setDetailBill(null)
                  void openBill(detailStay.id)
                }}
                disabled={!detailStay}
              >
                Bill & checkout
              </Button>
            </div>
          )
        }
      >
        {detailRoom && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={detailRoom.status} />
              {detailStay && <span className="text-sm font-semibold text-slate-900">{detailStay.guest_name}</span>}
            </div>
            {detailRoom.status === 'free' ? (
              <p className="text-sm font-medium text-slate-600">
                This room is available. Check a guest in to start charging restaurant orders to the room.
              </p>
            ) : (
              <>
                {detailStay && (
                  <p className="text-xs font-medium text-slate-500">
                    Checked in {formatDateTime(detailStay.checked_in_at)} · {hoursSince(detailStay.checked_in_at)} on premises
                  </p>
                )}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Restaurant charges</h3>
                  {detailBillLoading ? (
                    <div className="skeleton h-20 rounded-2xl" aria-label="Loading charges" />
                  ) : detailBill && detailBill.charges.length > 0 ? (
                    <>
                      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                        {detailBill.charges.map((charge) => (
                          <li key={charge.id} className="px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900">{charge.sale_number}</span>
                              <span className="text-sm font-bold tabular-nums text-slate-900">
                                {formatMoney(charge.total_amount)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {charge.items.map((l) => `${l.item_name} ×${l.quantity}`).join(' · ')}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3">
                        <span className="text-sm font-semibold text-white">Current total</span>
                        <span className="text-lg font-bold tabular-nums text-white">
                          {formatMoney(detailBill.charges_total)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-medium text-slate-500">
                      No restaurant charges yet.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </BottomSheet>

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
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCheckInRoom(null)}>
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
          <Select
            label="Business unit"
            value={addBuId}
            onChange={(e) => setAddBuId(e.target.value)}
          >
            <option value="">Select…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          {selectedBuId && addBuId && addBuId !== selectedBuId && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              Creating in “{units.find((u) => u.id === addBuId)?.name}”, not the filtered unit. Switch units in the
              top bar to see it afterwards.
            </p>
          )}
          <Input
            label="Room number"
            value={newRoomNumber}
            onChange={(e) => setNewRoomNumber(e.target.value)}
            placeholder="e.g. 101"
            autoComplete="off"
          />
          {addError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {addError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
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
            <p className="text-sm font-medium text-slate-600">
              Checked in {formatDateTime(bill.stay.checked_in_at)} · {hoursSince(bill.stay.checked_in_at)} on premises
            </p>
            {bill.charges.length === 0 ? (
              <EmptyState
                title="No room charges yet"
                description="Restaurant orders charged to this room will appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {bill.charges.map((charge) => (
                  <li key={charge.id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{charge.sale_number}</span>
                      <span className="font-bold tabular-nums text-slate-900">{formatMoney(charge.total_amount)}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
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
            <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3">
              <span className="text-sm font-semibold text-white">Total to settle</span>
              <span className="text-xl font-bold tabular-nums text-white">{formatMoney(bill.charges_total)}</span>
            </div>
            <div className="flex flex-wrap items-end justify-end gap-2">
              <Select
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

      <RestaurantOrderSheet
        open={orderSheetOpen}
        onClose={() => {
          setOrderSheetOpen(false)
          setOrderStayId(null)
        }}
        onSent={() => void load()}
        initialStayId={orderStayId}
      />

      {billLoading && <p className="text-xs font-medium text-slate-500">Loading bill…</p>}
    </div>
  )
}
