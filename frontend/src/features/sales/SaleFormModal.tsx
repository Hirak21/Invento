import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal, shouldAutoFocusForModal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listItems } from '@/services/masterData'
import { listMenuItems } from '@/services/menu'
import { createSale } from '@/services/sales'
import { listRooms, listStays } from '@/services/rooms'
import type { Room, Stay } from '@/types/room'
import type { InventoryItem } from '@/types/inventory'
import type { BusinessUnit } from '@/types/master'
import { PAYMENT_METHODS } from '@/types/purchase'
import type { SalePaymentMethod } from '@/types/sale'

type PaymentMethodChoice = SalePaymentMethod | 'room_charge'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

type CartLineItem = {
  kind: 'item'
  item: InventoryItem
  quantity: number
}

type CartLineRecipe = {
  kind: 'recipe'
  id: string
  name: string
  selling_price: string
  unit: string
  quantity: number
  ingredients: { item_name: string; qty: number; unit: string }[]
}

type CartLine = CartLineItem | CartLineRecipe

interface MenuItem {
  id: string
  name: string
  type: 'recipe' | 'shop_product'
  recipe_id: string | null
  selling_price: string
  ingredient_summary?: { item_name: string; qty: number; unit: string }[]
}

interface SaleFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: (saleNumber: string, total: string) => void
  businessUnits: BusinessUnit[]
}

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/

export function SaleFormModal({ open, onClose, onSaved, businessUnits }: SaleFormModalProps) {
  const { selectedBuId } = useBusinessUnit()
  const [businessUnitId, setBusinessUnitId] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<InventoryItem[]>([])
  const [searching, setSearching] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedMenuTab, setSelectedMenuTab] = useState<'items' | 'menu'>('items')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null)
  const [recipeQty, setRecipeQty] = useState('')
  const [discount, setDiscount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodChoice>('cash')
  const [rooms, setRooms] = useState<Room[]>([])
  const [openStayByRoom, setOpenStayByRoom] = useState<Map<string, Stay>>(new Map())
  const [selectedStayId, setSelectedStayId] = useState('')
  const [saleDate, setSaleDate] = useState(todayISO)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const menuSearchRef = useRef<HTMLInputElement>(null)
  const recipeQtyRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setBusinessUnitId(selectedBuId ?? businessUnits[0]?.id ?? '')
    setCart([])
    setSearch('')
    setDiscount('')
    setPaymentMethod('cash')
    setSelectedStayId('')
    setSaleDate(todayISO())
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
    setSelectedMenuTab('items')
    setSelectedMenuItem(null)
    setMenuItems([])
    // Desktop only: mobile must not pop the keyboard on modal open.
    if (!shouldAutoFocusForModal()) return
    setTimeout(() => {
      if (selectedMenuTab === 'items') {
        searchRef.current?.focus()
      } else {
        menuSearchRef.current?.focus()
      }
    }, 50)
  }, [open, selectedBuId, businessUnits, selectedMenuTab])

  const runSearch = useCallback((text: string) => {
    if (!businessUnitId) return
    setSearching(true)
    listItems({ business_unit_id: businessUnitId, search: text || undefined })
      .then((res) => setResults(res.items))
      .catch(() => undefined)
      .finally(() => setSearching(false))
  }, [businessUnitId])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(search), 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, open, runSearch])

  useEffect(() => {
    if (!open || !businessUnitId || selectedMenuTab !== 'menu') return
    setMenuLoading(true)
    listMenuItems(businessUnitId)
      .then(setMenuItems)
      .catch(() => setMenuItems([]))
      .finally(() => setMenuLoading(false))
  }, [open, businessUnitId, selectedMenuTab])

  useEffect(() => {
    if (!open || !businessUnitId || paymentMethod !== 'room_charge') return
    let cancelled = false
    Promise.all([listRooms({ business_unit_id: businessUnitId, status: 'occupied' }), listStays({ business_unit_id: businessUnitId, status: 'open' })])
      .then(([roomsRes, staysRes]) => {
        if (cancelled) return
        setRooms(roomsRes.rooms)
        const open = new Map<string, Stay>()
        for (const stay of staysRes.stays) open.set(stay.room_id, stay)
        setOpenStayByRoom(open)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, businessUnitId, paymentMethod])

  function addItemToCart(item: InventoryItem) {
    setError(null)
    if (item.current_stock <= 0) {
      setError(`'${item.name}' is out of stock.`)
      return
    }
    setCart((current) => {
      const existing = current.find((line) => line.kind === 'item' && line.item.id === item.id)
      if (existing) {
        if (existing.quantity + 1 > item.current_stock) {
          setError(`Only ${item.current_stock} ${item.base_unit} of '${item.name}' in stock.`)
          return current
        }
        return current.map((line) =>
          line.kind === 'item' && line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...current, { kind: 'item', item, quantity: 1 }]
    })
    searchRef.current?.focus()
    searchRef.current?.select()
  }

  function setItemQuantity(itemId: string, quantity: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.kind !== 'item' || line.item.id !== itemId) return line
          const clamped = Math.min(Math.max(1, quantity), line.item.current_stock)
          return { ...line, quantity: clamped }
        })
        .filter((line) => line.quantity > 0),
    )
  }

  function addRecipeToCart() {
    if (!selectedMenuItem) return
    const qty = Number(recipeQty)
    if (!qty || qty <= 0) return setError('Enter a valid quantity.')
    setError(null)
    const existing = cart.find((line) => line.kind === 'recipe' && line.id === selectedMenuItem.id)
    if (existing) {
      setCart((current) =>
        current.map((line) =>
          line.kind === 'recipe' && line.id === selectedMenuItem.id
            ? { ...line, quantity: line.quantity + qty }
            : line,
        ),
      )
    } else {
      setCart((current) => [
        ...current,
        {
          kind: 'recipe',
          id: selectedMenuItem.id,
          name: selectedMenuItem.name,
          selling_price: selectedMenuItem.selling_price,
          unit: selectedMenuItem.ingredient_summary?.[0]?.unit ?? 'pcs',
          quantity: qty,
          ingredients: selectedMenuItem.ingredient_summary ?? [],
        },
      ])
    }
    setSelectedMenuItem(null)
    setRecipeQty('')
    menuSearchRef.current?.focus()
    menuSearchRef.current?.select()
  }

  function setRecipeQuantity(id: string, quantity: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.kind !== 'recipe' || line.id !== id) return line
          return { ...line, quantity }
        })
        .filter((line) => line.quantity > 0),
    )
  }

  const subtotal = useMemo(
    () =>
      cart.reduce((sum, line) => {
        if (line.kind === 'item') {
          return sum + Number(line.quantity) * Number(line.item.selling_price ?? '0')
        }
        return sum + Number(line.quantity) * Number(line.selling_price)
      }, 0),
    [cart],
  )
  const discountValue = MONEY_RE.test(discount) ? Number(discount) : 0
  const total = Math.max(0, subtotal - discountValue)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (cart.length === 0) return setError('Add at least one item to the sale.')
    if (discount && !MONEY_RE.test(discount)) return setError('Enter a valid discount amount.')
    if (paymentMethod === 'room_charge' && !selectedStayId)
      return setError('Select the occupied room to charge this sale to.')

    const itemLines = cart.filter((l) => l.kind === 'item')
    const overselling = itemLines.find((line) => line.quantity > line.item.current_stock)
    if (overselling)
      return setError(
        `Only ${overselling.item.current_stock} ${overselling.item.base_unit} of '${overselling.item.name}' in stock.`,
      )

    setPending(true)
    try {
      // Build lines uniformly: recipe lines carry the recipe id (the backend
      // expands the BOM and snapshots name/price), item lines the item id.
      // recipe_id is sent only for a single-recipe sale (legacy contract);
      // mixed carts work with plain lines.
      const lines = cart.map((line) =>
        line.kind === 'item'
          ? { item_id: line.item.id, quantity: line.quantity, unit_price: line.item.selling_price ?? '0.00' }
          : { item_id: line.id, quantity: line.quantity, unit_price: line.selling_price },
      )
      const isSingleRecipe = cart.length === 1 && cart[0].kind === 'recipe'
      const sale = await createSale({
        business_unit_id: businessUnitId,
        items: lines,
        discount: discount || null,
        payment_method: paymentMethod,
        stay_id: paymentMethod === 'room_charge' ? selectedStayId : null,
        date: saleDate,
        idempotency_key: idempotencyKey,
        ...(isSingleRecipe ? { recipe_id: (cart[0] as CartLineRecipe).id } : {}),
      })
      onSaved(sale.sale_number, sale.total_amount)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the sale.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} title="New sale" onClose={onClose} wide>
      {!businessUnitId ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No business unit available. Add one in Settings first.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_260px]">
            <div className="min-w-0">
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedMenuTab('items')}
                  className={`flex-1 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                    selectedMenuTab === 'items'
                      ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Items
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMenuTab('menu')}
                  className={`flex-1 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                    selectedMenuTab === 'menu'
                      ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Menu
                </button>
              </div>

              {selectedMenuTab === 'items' ? (
                <>
                  <Input
                    ref={searchRef}
                    label=""
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (results.length > 0) addItemToCart(results[0])
                      }
                    }}
                    placeholder="Search item by name or SKU… (Enter adds first result)"
                    autoComplete="off"
                  />
                  {searching && <p className="mt-2 text-xs text-slate-400">Searching…</p>}
                  <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                    {results.length === 0 && !searching ? (
                      <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        No items found{search ? ` for "${search}"` : ''}. Add items in Inventory first.
                      </li>
                    ) : (
                      results.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => addItemToCart(item)}
                            disabled={item.current_stock <= 0}
                            className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 disabled:opacity-40"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-900">{item.name}</span>
                              <span className="text-xs text-slate-400">
                                {item.current_stock} {item.base_unit} in stock
                                {item.sku ? ` · ${item.sku}` : ''}
                              </span>
                            </span>
                            <span className="ml-2 shrink-0 text-sm font-semibold text-indigo-700">
                              {item.selling_price ? `₹${Number(item.selling_price).toFixed(0)}` : '—'}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              ) : (
                <>
                  <Input
                    ref={menuSearchRef}
                    label=""
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search menu items…"
                    autoComplete="off"
                  />
                  {menuLoading ? (
                    <p className="mt-2 text-xs text-slate-400">Loading menu…</p>
                  ) : (
                    <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                      {menuItems.length === 0 && !menuLoading ? (
                        <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          No menu items found for this business unit.
                        </li>
                      ) : (
                        menuItems.map((mi) => (
                          <li key={mi.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMenuItem(mi)
                                setSearch('')
                                setTimeout(() => recipeQtyRef.current?.focus(), 50)
                              }}
                              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/60"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-900">
                                  {mi.name}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {mi.type === 'recipe' ? 'Recipe · ' : 'Product · '}
                                  {mi.selling_price ? `₹${Number(mi.selling_price).toFixed(0)}` : '—'}
                                </span>
                                {mi.ingredient_summary && mi.type === 'recipe' && (
                                  <span className="block text-xs text-slate-500 mt-0.5">
                                    {mi.ingredient_summary.map((i) => `${i.qty} ${i.unit} ${i.item_name}`).join(', ')}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  {selectedMenuItem && (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                      <p className="text-sm font-medium text-slate-900">{selectedMenuItem.name}</p>
                      {selectedMenuItem.ingredient_summary && selectedMenuItem.type === 'recipe' && (
                        <ul className="mt-2 space-y-1">
                          {selectedMenuItem.ingredient_summary.map((ing, idx) => (
                            <li key={idx} className="text-xs text-slate-600">
                              {ing.qty} {ing.unit} {ing.item_name}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <Input
                          ref={recipeQtyRef}
                          label=""
                          type="number"
                          min="1"
                          step="1"
                          value={recipeQty}
                          onChange={(e) => setRecipeQty(e.target.value)}
                          placeholder="Qty"
                          className="w-20"
                          autoComplete="off"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addRecipeToCart()
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={addRecipeToCart}
                          className="shrink-0"
                        >
                          Add
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMenuItem(null)
                            setRecipeQty('')
                          }}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Sale summary</h3>
              {cart.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {selectedMenuTab === 'items'
                    ? 'Click or search items to add them here.'
                    : 'Select a menu item to add it here.'}
                </p>
              ) : (
                <ul className="space-y-2 overflow-y-auto" style={{ maxHeight: '14rem' }}>
                  {cart.map((line) => {
                    if (line.kind === 'item') {
                      return (
                        <li key={line.item.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-slate-700">{line.item.name}</span>
                          <span className="flex shrink-0 items-center rounded-md border border-slate-300 bg-white">
                            <button
                              type="button"
                              aria-label={`Decrease ${line.item.name}`}
                              onClick={() => setItemQuantity(line.item.id, line.quantity - 1)}
                              className="px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                            >
                              −
                            </button>
                            <span className="w-8 text-center tabular-nums">{line.quantity}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${line.item.name}`}
                              onClick={() => setItemQuantity(line.item.id, line.quantity + 1)}
                              className="px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                            >
                              +
                            </button>
                          </span>
                        </li>
                      )
                    }
                    return (
                      <li key={line.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-700">{line.name}</span>
                          <span className="block text-xs text-slate-400">
                            {line.ingredients.length} ingredients × {line.quantity}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center rounded-md border border-slate-300 bg-white">
                          <button
                            type="button"
                            onClick={() => setRecipeQuantity(line.id, line.quantity - 1)}
                            className="px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                          >
                            −
                          </button>
                          <span className="w-8 text-center tabular-nums">{line.quantity}</span>
                          <button
                            type="button"
                            onClick={() => setRecipeQuantity(line.id, line.quantity + 1)}
                            className="px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                          >
                            +
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="space-y-2 border-t border-slate-200 pt-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums">₹{subtotal.toFixed(2)}</span>
                </div>
                <Input
                  label=""
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  inputMode="decimal"
                  placeholder="Discount ₹ (optional)"
                />
                <div className="flex justify-between text-base font-bold text-slate-900">
                  <span>Total</span>
                  <span className="tabular-nums">₹{total.toFixed(2)}</span>
                </div>
              </div>

              <Input
                label="Sale date"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                max={todayISO()}
              />
              <Select
                label=""
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodChoice)}
                aria-label="Payment method"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    Paid via {m.label}
                  </option>
                ))}
                <option value="room_charge">Charge to room</option>
              </Select>
              {paymentMethod === 'room_charge' && (
                <Select
                  label=""
                  value={selectedStayId}
                  onChange={(e) => setSelectedStayId(e.target.value)}
                  aria-label="Room to charge"
                  error={paymentMethod === 'room_charge' && !selectedStayId ? 'Select the room to charge.' : null}
                >
                  <option value="">Select occupied room…</option>
                  {rooms.map((room) => {
                    const stay = openStayByRoom.get(room.id)
                    return (
                      <option key={room.id} value={stay?.id ?? ''}>
                        Room {room.room_number}
                        {stay ? ` · ${stay.guest_name}` : ''}
                      </option>
                    )
                  })}
                </Select>
              )}

              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              <Button type="submit" pending={pending} className="w-full">
                Complete sale · ₹{total.toFixed(2)}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
