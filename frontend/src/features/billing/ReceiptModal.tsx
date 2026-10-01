import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { getStayBill, listStays } from '@/services/rooms'
import { getSettings } from '@/services/settings'
import type { BusinessSettings } from '@/services/settings'
import type { Stay, StayBill } from '@/types/room'

interface ReceiptModalProps {
  open: boolean
  onClose: () => void
  businessUnitId?: string
}

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

function billToText(bill: StayBill, businessName: string): string {
  const lines = [
    businessName.toUpperCase(),
    `Room ${bill.stay.room_number} · ${bill.stay.guest_name}`,
    `Checked in: ${formatDateTime(bill.stay.checked_in_at)}`,
    `------------------------------`,
  ]
  for (const c of bill.charges) {
    lines.push(`${c.sale_number} · ${formatDateTime(c.sold_at)}`)
    for (const l of c.items) {
      lines.push(`  ${l.quantity} x ${l.item_name} — ${formatMoney(l.line_total)}`)
    }
    lines.push(`  Subtotal: ${formatMoney(c.total_amount)}`)
  }
  lines.push(`------------------------------`)
  lines.push(`TOTAL: ${formatMoney(bill.charges_total)} (${bill.charge_count} charge(s))`)
  return lines.join('\n')
}

export function ReceiptModal({ open, onClose, businessUnitId }: ReceiptModalProps) {
  const [stays, setStays] = useState<Stay[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStayId, setSelectedStayId] = useState('')
  const [bill, setBill] = useState<StayBill | null>(null)
  const [billLoading, setBillLoading] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [branding, setBranding] = useState<BusinessSettings | null>(null)
  const [logoOk, setLogoOk] = useState(true)

  useEffect(() => {
    if (!open) return
    setError(null)
    setBill(null)
    setSelectedStayId('')
    setShareNote(null)
    setLoading(true)
    setLogoOk(true)
    listStays({ business_unit_id: businessUnitId, status: 'open' })
      .then((res) => setStays(res.stays ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load guests.'))
      .finally(() => setLoading(false))
    // Branding is decorative: a failure here must never block the bill.
    getSettings()
      .then((s) => {
        setBranding(s)
        setLogoOk(true)
      })
      .catch(() => undefined)
  }, [open, businessUnitId])

  useEffect(() => {
    if (!open || !selectedStayId) {
      setBill(null)
      return
    }
    let cancelled = false
    setBillLoading(true)
    setError(null)
    getStayBill(selectedStayId)
      .then((b) => {
        if (!cancelled) setBill(b)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the bill.')
      })
      .finally(() => {
        if (!cancelled) setBillLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedStayId])

  async function handleShare() {
    if (!bill) return
    const text = billToText(bill, branding?.business_name ?? 'Receipt')
    setShareNote(null)
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await (navigator as Navigator & { share: (d: { title: string; text: string }) => Promise<void> }).share({
          title: `Receipt — Room ${bill.stay.room_number}`,
          text,
        })
        return
      }
      throw new Error('no-share')
    } catch {
      try {
        await navigator.clipboard.writeText(text)
        setShareNote('Receipt copied — paste it in WhatsApp / SMS to share.')
      } catch {
        setShareNote('Sharing is not available on this device. Screenshot the receipt instead.')
      }
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <Modal open={open} title="Receipts / Billing" onClose={onClose} wide>
      <div className="space-y-4">
        <Select
          label="Guest / room"
          value={selectedStayId}
          onChange={(e) => setSelectedStayId(e.target.value)}
          aria-label="Guest or room for receipt"
        >
          <option value="">Select an occupied room…</option>
          {stays.map((s) => (
            <option key={s.id} value={s.id}>
              Room {s.room_number} · {s.guest_name}
            </option>
          ))}
        </Select>

        {loading && <p className="text-sm text-slate-500">Loading guests…</p>}

        {!loading && stays.length === 0 && !error && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-medium text-slate-500">
            No checked-in guests right now. Check a guest in from Rooms first.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </p>
        )}

        {billLoading && <div className="skeleton h-40 rounded-2xl" aria-label="Loading receipt" />}

        {bill && (
          <div id="receipt-print" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-3">
                {branding?.has_logo && branding.logo_url && logoOk ? (
                  <img
                    src={branding.logo_url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-contain"
                    onError={() => setLogoOk(false)}
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-slate-900">
                    {branding?.business_name ?? 'Receipt'}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Room {bill.stay.room_number} · {bill.stay.guest_name}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Checked in {formatDateTime(bill.stay.checked_in_at)}
              </p>
            </div>
            {bill.charges.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm font-medium text-slate-500">No charges yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bill.charges.map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{c.sale_number}</span>
                      <span className="text-xs text-slate-500">{formatDateTime(c.sold_at)}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {c.items.map((l, idx) => (
                        <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate text-slate-700">
                            {l.quantity} × {l.item_name}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatMoney(l.line_total)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(c.total_amount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
              <span className="text-sm font-semibold text-white">Total ({bill.charge_count})</span>
              <span className="text-xl font-bold tabular-nums text-white">{formatMoney(bill.charges_total)}</span>
            </div>
          </div>
        )}

        {shareNote && <p role="status" className="text-xs font-medium text-slate-600">{shareNote}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={handlePrint} disabled={!bill}>
            Print
          </Button>
          <Button onClick={() => void handleShare()} disabled={!bill}>
            Share / Copy
          </Button>
        </div>
      </div>
    </Modal>
  )
}
