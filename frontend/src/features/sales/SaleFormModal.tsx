import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listItems } from '@/services/masterData'
import { createSale } from '@/services/sales'
import type { InventoryItem } from '@/types/inventory'
import type { BusinessUnit } from '@/types/master'
import { PAYMENT_METHODS } from '@/types/purchase'
import type { SalePaymentMethod } from '@/types/sale'

interface CartLine {
  item: InventoryItem
  quantity: number
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
  const [discount, setDiscount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setBusinessUnitId(selectedBuId ?? businessUnits[0]?.id ?? '')
    setCart([])
    setSearch('')
    setDiscount('')
    setPaymentMethod('cash')
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
    // Focus the search box immediately — sale entry must be fast.
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [open, selectedBuId, businessUnits])

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

  function addToCart(item: InventoryItem) {
    setError(null)
    if (item.current_stock <= 0) {
      setError(`'${item.name}' is out of stock.`)
      return
    }
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id)
      if (existing) {
        if (existing.quantity + 1 > item.current_stock) {
          setError(`Only ${item.current_stock} ${item.base_unit} of '${item.name}' in stock.`)
          return current
        }
        return current.map((line) =>
          line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...current, { item, quantity: 1 }]
    })
    // Keep hands on the keyboard — refocus + select for the next scan.
    searchRef.current?.focus()
    searchRef.current?.select()
  }

  function setQuantity(itemId: string, quantity: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.item.id !== itemId) return line
          const clamped = Math.min(Math.max(1, quantity), line.item.current_stock)
          return { ...line, quantity: clamped }
        })
        .filter((line) => line.quantity > 0),
    )
  }

  const subtotal = useMemo(
    () =>
      cart.reduce((sum, line) => sum + Number(line.quantity) * Number(line.item.selling_price ?? '0'), 0),
    [cart],
  )
  const discountValue = MONEY_RE.test(discount) ? Number(discount) : 0
  const total = Math.max(0, subtotal - discountValue)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (cart.length === 0) return setError('Add at least one item to the sale.')
    if (discount && !MONEY_RE.test(discount)) return setError('Enter a valid discount amount.')

    const overselling = cart.find((line) => line.quantity > line.item.current_stock)
    if (overselling)
      return setError(
        `Only ${overselling.item.current_stock} ${overselling.item.base_unit} of '${overselling.item.name}' in stock.`,
      )

    setPending(true)
    try {
      const sale = await createSale({
        business_unit_id: businessUnitId,
        items: cart.map((line) => ({
          item_id: line.item.id,
          quantity: line.quantity,
          unit_price: line.item.selling_price ?? '0.00',
        })),
        discount: discount || null,
        payment_method: paymentMethod,
        idempotency_key: idempotencyKey,
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
            {/* Left: item search + results */}
            <div className="min-w-0">
              <Input
                ref={searchRef}
                label=""
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (results.length > 0) addToCart(results[0])
                  }
                }}
                placeholder="Search item by name or SKU… (Enter adds first result)"
                autoComplete="off"
              />
              {searching && <p className="mt-2 text-xs text-slate-400">Searching…</p>}
              <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                {results.length === 0 && !searching ? (
                  <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No items found{search ? ` for “${search}”` : ''}. Add items in Inventory first.
                  </li>
                ) : (
                  results.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
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
            </div>

            {/* Right: cart summary */}
            <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Sale summary</h3>
              {cart.length === 0 ? (
                <p className="text-sm text-slate-500">Click or search items to add them here.</p>
              ) : (
                <ul className="space-y-2 overflow-y-auto" style={{ maxHeight: '14rem' }}>
                  {cart.map((line) => (
                    <li key={line.item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-slate-700">{line.item.name}</span>
                      <span className="flex shrink-0 items-center rounded-md border border-slate-300 bg-white">
                        <button type="button" aria-label={`Decrease ${line.item.name}`} onClick={() => setQuantity(line.item.id, line.quantity - 1)} className="px-2 py-0.5 text-slate-600 hover:bg-slate-100">−</button>
                        <span className="w-8 text-center tabular-nums">{line.quantity}</span>
                        <button type="button" aria-label={`Increase ${line.item.name}`} onClick={() => setQuantity(line.item.id, line.quantity + 1)} className="px-2 py-0.5 text-slate-600 hover:bg-slate-100">+</button>
                      </span>
                    </li>
                  ))}
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

              <Select label="" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as SalePaymentMethod)} aria-label="Payment method">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    Paid via {m.label}
                  </option>
                ))}
              </Select>

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
