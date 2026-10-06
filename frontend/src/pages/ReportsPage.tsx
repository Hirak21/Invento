import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { apiDownload, apiFetch } from '@/services/api'
import { cn } from '@/utils/cn'

type Period = 'today' | '7d' | 'month' | 'custom'

const PERIOD_TABS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
]

interface SummaryItem {
  item_id: string
  item_name: string
  unit: string
  quantity_sold: number
  revenue: string
  orders: number
}

interface Summary {
  period: { from: string; to: string }
  totals: {
    gross: string
    discounts: string
    tax: string
    net: string
    orders: number
    quantity: number
  }
  items: SummaryItem[]
}

function tzOffsetMinutes(): number {
  try {
    return -new Date().getTimezoneOffset()
  } catch {
    return 0
  }
}

function money(n: string): string {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ReportsPage() {
  const { selectedBuId } = useBusinessUnit()
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo)) {
      setSummary(null)
      return
    }
    let cancelled = false
    setLoadingSummary(true)
    setSummaryError(null)
    const params = new URLSearchParams({ period, tz_offset_minutes: String(tzOffsetMinutes()) })
    if (selectedBuId) params.set('business_unit_id', selectedBuId)
    if (period === 'custom') {
      params.set('from', customFrom)
      params.set('to', customTo)
    }
    apiFetch<Summary>(`/reports/summary?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setSummary(res)
      })
      .catch((err) => {
        if (!cancelled) setSummaryError(err instanceof Error ? err.message : 'Could not load the summary.')
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, customFrom, customTo, selectedBuId])

  async function download() {
    setError(null)
    if (period === 'custom' && (!customFrom || !customTo)) {
      setError('Pick both dates for a custom range.')
      return
    }
    setDownloading(true)
    try {
      const params = new URLSearchParams({ period, tz_offset_minutes: String(tzOffsetMinutes()) })
      if (selectedBuId) params.set('business_unit_id', selectedBuId)
      if (period === 'custom') {
        params.set('from', customFrom)
        params.set('to', customTo)
      }
      // Binary download: fetch with auth header, then hand the blob to the browser.
      const blob = await apiDownload(`/reports/export?${params.toString()}`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `invento-report-${period === 'custom' ? `${customFrom}_${customTo}` : period}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the report.')
    } finally {
      setDownloading(false)
    }
  }

  const totals = summary?.totals

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sales, purchases, expenses and stock &amp; wastage for the chosen period, plus an executive summary with
          live formulas. Wastage is shown as a separate non-cash memo (stock was already paid at purchase).
        </p>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriod(tab.id)}
                className={cn(
                  'min-h-[44px] rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  period === tab.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="From" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <Input label="To" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}

          <p className="text-sm text-slate-500">
            {selectedBuId
              ? 'The report covers the business unit selected in the top bar.'
              : 'No unit selected — the report covers all business units.'}
            {period === 'custom' && customFrom && customTo
              ? ` Custom range is ${customFrom} 00:00 → ${customTo} 23:59 IST.`
              : ''}
          </p>

          {summaryError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {summaryError}
            </p>
          )}

          {loadingSummary ? (
            <p className="py-4 text-center text-sm text-slate-500">Loading summary…</p>
          ) : totals ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Gross sales', money(totals.gross)],
                  ['Discounts', money(totals.discounts)],
                  ['Net sale', money(totals.net)],
                  ['Orders', String(totals.orders)],
                  ['Qty sold', String(totals.quantity)],
                  ['Tax', money(totals.tax)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="text-base font-bold tabular-nums text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>

              {summary && summary.items.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2 font-medium">Item / recipe</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.items.map((row) => (
                        <tr key={row.item_id}>
                          <td className="px-3 py-2 text-slate-700">
                            {row.item_name}
                            <span className="ml-1 text-xs text-slate-400">
                              {row.orders} order{row.orders === 1 ? '' : 's'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                            {row.quantity_sold} {row.unit}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                            {money(row.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No sales found for this period.
                </p>
              )}
            </div>
          ) : null}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button pending={downloading} onClick={() => void download()}>
            Download Excel report
          </Button>
        </div>
      </Card>
    </div>
  )
}
