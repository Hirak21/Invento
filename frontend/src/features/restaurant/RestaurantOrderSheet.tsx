import { useEffect, useMemo, useState } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listMenuItems } from '@/services/menu'
import { listRooms, listStays } from '@/services/rooms'
import { createSale } from '@/services/sales'
import type { MenuItem } from '@/types/recipe'
import type { Stay } from '@/types/room'
import { cn } from '@/utils/cn'

interface RestaurantOrderSheetProps {
  open: boolean
  onClose: () => void
  onSent: () => void
  /** Preselect this stay (e.g. launched from a room). */
  initialStayId?: string | null
}

function money(value: string | number): string {
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export function RestaurantOrderSheet({ open, onClose, onSent, initialStayId }: RestaurantOrderSheetProps) {
  const { selectedBuId } = useBusinessUnit()
  const [stays, setStays] = useState<Stay[]>([])
  const [selectedStayId, setSelectedStayId] = useState('')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roomsNote, setRoomsNote] = useState<string | null>(null)
  const [menuNote, setMenuNote] = useState<string | null>(null)
  // Stable per-sheet key: double-tap / retry reuses it, so the backend
  // idempotency guarantee turns a duplicate submit into the same order.
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (!open) return
    setError(null)
    setRoomsNote(null)
    setMenuNote(null)
    setSearch('')
    setCart({})
    setNote('')
    setSelectedStayId(initialStayId ?? '')
    setIdempotencyKey(crypto.randomUUID())
    if (!selectedBuId) return
    let cancelled = false
    setLoading(true)
    // Rooms/stays are property-level: load ALL open stays so a Restaurant
    // sale can charge a room created under any unit. Each request settles
    // independently — a failing menu fetch must not blank the rooms list.
    Promise.allSettled([
      listStays({ status: 'open' }),
      listRooms({ status: 'occupied' }),
      listMenuItems(selectedBuId),
    ]).then(([staysRes, , menuRes]) => {
      if (cancelled) return
      if (staysRes.status === 'fulfilled') {
        const open = staysRes.value.stays ?? []
        setStays(open)
        if (initialStayId && open.some((s) => s.id === initialStayId)) {
          setSelectedStayId(initialStayId)
        }
      } else {
        setRoomsNote('Could not load checked-in guests. Retry in a moment.')
      }
      if (menuRes.status === 'fulfilled') {
        setMenuItems((menuRes.value ?? []).filter((m) => m.active !== false))
      } else {
        setMenuNote('Could not load the menu. Retry in a moment.')
      }
      if (staysRes.status === 'rejected' && menuRes.status === 'rejected') {
        setError('Could not load rooms and menu. Check your connection and retry.')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, selectedBuId, initialStayId])

  const visibleMenu = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return menuItems
    return menuItems.filter((m) => m.name.toLowerCase().includes(q))
  }, [menuItems, search])

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([id, quantity]) => {
          const item = menuItems.find((m) => m.id === id)!
          return { item, quantity }
        })
        .filter((l) => l.item),
    [cart, menuItems],
  )

  const total = lines.reduce((sum, l) => sum + Number(l.item.selling_price) * l.quantity, 0)
  const selectedStay = stays.find((s) => s.id === selectedStayId) ?? null

  function setQty(id: string, qty: number) {
    setCart((c) => {
      if (qty <= 0) {
        const { [id]: _drop, ...rest } = c
        return rest
      }
      return { ...c, [id]: qty }
    })
  }

  async function handleSend() {
    if (!selectedBuId) {
      setError('Select a business unit first (top bar).')
      return
    }
    if (!selectedStayId) {
      setError('Select the room first.')
      return
    }
    if (lines.length === 0) {
      setError('Add at least one item.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const sale = await createSale({
        business_unit_id: selectedBuId,
        items: lines.map((l) => ({
          item_id: l.item.id,
          quantity: l.quantity,
          unit_price: l.item.selling_price,
        })),
        payment_method: 'room_charge',
        stay_id: selectedStayId,
        notes: note.trim() || null,
        idempotency_key: idempotencyKey,
      })
      toast({
        title: `Order sent to Room ${sale.room_number ?? selectedStay?.room_number ?? ''}`,
        description: `${sale.sale_number} · ${money(sale.total_amount)}`,
        variant: 'success',
      })
      onSent()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the order.')
    } finally {
      setSending(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="New restaurant order"
      action={
        <Button size="lg" fullWidth pending={sending} disabled={sending || !selectedStayId || lines.length === 0} onClick={() => void handleSend()}>
          {lines.length === 0
            ? 'Send order'
            : `Send order · ${money(total)}${selectedStay ? ` → Room ${selectedStay.room_number}` : ''}`}
        </Button>
      }
    >
      <div className="space-y-5">
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </p>
        )}

        {/* 1 — Room */}
        <section aria-labelledby="ro-room">
          <h3 id="ro-room" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            1 · Room
          </h3>
          {loading ? (
            <div className="skeleton h-16 rounded-2xl" aria-label="Loading rooms" />
          ) : roomsNote ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {roomsNote}
            </p>
          ) : stays.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-medium text-slate-500">
              No guests checked in. Check a guest in first, then send the order to their room.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar" role="radiogroup" aria-label="Room">
              {stays.map((stay) => {
                const active = stay.id === selectedStayId
                return (
                  <button
                    key={stay.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedStayId(stay.id)}
                    className={cn(
                      'min-h-[64px] min-w-[104px] shrink-0 rounded-2xl border-2 px-3 py-2 text-left transition-colors',
                      active
                        ? 'border-emerald-600 bg-emerald-50'
                        : 'border-slate-200 bg-white active:bg-slate-50',
                    )}
                  >
                    <span className="block text-base font-bold tabular-nums text-slate-900">{stay.room_number}</span>
                    <span className="block max-w-[88px] truncate text-xs font-medium text-slate-500">{stay.guest_name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* 2 — Items */}
        <section aria-labelledby="ro-items">
          <h3 id="ro-items" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            2 · Items
          </h3>
          <Input
            label=""
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu…"
            autoComplete="off"
            aria-label="Search menu"
          />
          {loading ? (
            <div className="mt-2 space-y-2" aria-label="Loading menu">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-16 rounded-2xl" />
              ))}
            </div>
          ) : menuNote ? (
            <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {menuNote}
            </p>
          ) : visibleMenu.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-medium text-slate-500">
              {menuItems.length === 0 ? 'No menu items for this unit yet.' : `No menu items match “${search}”.`}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {visibleMenu.map((item) => {
                const qty = cart[item.id] ?? 0
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-2xl border p-3',
                      qty > 0 ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-200 bg-white',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                      <p className="text-xs font-semibold tabular-nums text-slate-500">{money(item.selling_price)}</p>
                    </div>
                    {qty === 0 ? (
                      <Button size="sm" variant="secondary" onClick={() => setQty(item.id, 1)} aria-label={`Add ${item.name}`}>
                        Add
                      </Button>
                    ) : (
                      <span className="flex shrink-0 items-center rounded-xl border border-slate-300 bg-white">
                        <button
                          type="button"
                          aria-label={`Remove one ${item.name}`}
                          onClick={() => setQty(item.id, qty - 1)}
                          className="flex h-11 w-11 items-center justify-center rounded-l-xl text-lg font-bold text-slate-700 active:bg-slate-100"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-bold tabular-nums" aria-live="polite">{qty}</span>
                        <button
                          type="button"
                          aria-label={`Add one ${item.name}`}
                          onClick={() => setQty(item.id, qty + 1)}
                          className="flex h-11 w-11 items-center justify-center rounded-r-xl text-lg font-bold text-slate-700 active:bg-slate-100"
                        >
                          +
                        </button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* 3 — Note (optional) */}
        <section aria-labelledby="ro-note">
          <h3 id="ro-note" className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            3 · Note <span className="font-medium normal-case">(optional)</span>
          </h3>
          <Input
            label=""
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Less spicy, no onion…"
            autoComplete="off"
            aria-label="Order note"
          />
        </section>
      </div>
    </BottomSheet>
  )
}
