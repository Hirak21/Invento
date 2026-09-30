import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { apiDownload } from '@/services/api'
import { cn } from '@/utils/cn'

type Period = 'today' | '7d' | 'month' | 'custom'

const PERIOD_TABS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
]

export function ReportsPage() {
  const { selectedBuId } = useBusinessUnit()
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setError(null)
    if (period === 'custom' && (!customFrom || !customTo)) {
      setError('Pick both dates for a custom range.')
      return
    }
    setDownloading(true)
    try {
      const params = new URLSearchParams({ period })
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
          </p>

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
