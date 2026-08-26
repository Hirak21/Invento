import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/Select'
import { Card, EmptyState } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { fetchSummary } from '@/services/dashboard'
import type { DashboardSummary, Period } from '@/services/dashboard'
import { formatMoney } from '@/types/inventory'
import type { StockStatus } from '@/types/inventory'
import { cn } from '@/utils/cn'

const PERIOD_TABS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
]

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatCard({
  title,
  value,
  note,
  tone,
}: {
  title: string
  value: string
  note?: string
  tone?: 'default' | 'warning' | 'danger'
}) {
  return (
    <Card>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className={cn('mt-2 text-2xl font-semibold', tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-slate-900')}>
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
    </Card>
  )
}

export function DashboardPage() {
  const { selectedBuId } = useBusinessUnit()
  const [period, setPeriod] = useState<Period>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (period === 'custom' && (!customFrom || !customTo)) {
      setSummary(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await fetchSummary({
        period,
        from: customFrom,
        to: customTo,
      })
      setSummary(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dashboard.')
    } finally {
      setLoading(false)
    }
  }, [period, customFrom, customTo])

  useEffect(() => {
    void load()
    // Reload when BU changes too.
  }, [load, selectedBuId])

  const maxTrend = summary
    ? Math.max(...summary.sales_trend.map((point) => Number(point.total)), 1)
    : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting()}
            {(summary?.totals.sale_count ?? 0) > 0 && (
              <span className="ml-2 text-base font-normal text-slate-500">
                · {summary?.totals.sale_count} sale{summary?.totals.sale_count === 1 ? '' : 's'} this period
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here is where your business stands.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                period === tab.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Input label="From" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <Input label="To" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading && !summary ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading dashboard…</p>
      ) : !summary ? (
        <EmptyState message="Pick a date range to see your numbers." />
      ) : (
        <>
          {/* Primary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total Sales" value={formatMoney(summary.totals.sales)} />
            <StatCard title="Purchases" value={formatMoney(summary.totals.purchases)} />
            <StatCard title="Expenses" value={formatMoney(summary.totals.expenses)} />
            <StatCard
              title="Low Stock"
              value={`${summary.low_stock.length} item${summary.low_stock.length === 1 ? '' : 's'}`}
              tone={summary.low_stock.length > 0 ? 'warning' : 'default'}
              note={`Inventory at cost: ${formatMoney(summary.totals.inventory_value)}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Sales trend */}
            <Card title="Sales trend">
              {summary.sales_trend.length === 0 ? (
                <EmptyState message="No sales recorded in this period yet." />
              ) : (
                <div className="flex h-36 items-end gap-1.5">
                  {summary.sales_trend.map((point) => (
                    <div key={point.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
                      <span className="w-max rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        ₹{Number(point.total).toFixed(0)}
                      </span>
                      <div
                        className="w-full rounded-t bg-indigo-500/80 transition-colors group-hover:bg-indigo-600"
                        style={{ height: `${Math.max(6, (Number(point.total) / maxTrend) * 110)}px` }}
                        aria-hidden="true"
                      />
                      <span className="max-w-full truncate text-[10px] text-slate-400">
                        {point.date.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Business split */}
            <Card title="Restaurant vs Shop">
              {summary.business_split.length === 0 ? (
                <EmptyState message="No business units configured yet. Add them in Settings." />
              ) : (
                <ul className="space-y-4">
                  {summary.business_split.map((unit) => {
                    const totalSales = summary.business_split.reduce(
                      (sum, u) => sum + Number(u.sales),
                      0,
                    )
                    const share = totalSales > 0 ? (Number(unit.sales) / totalSales) * 100 : 0
                    return (
                      <li key={unit.business_unit_id}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-700">{unit.name}</span>
                          <span className="tabular-nums text-slate-600">
                            {formatMoney(unit.sales)}
                            <span className="ml-2 text-xs text-slate-400">
                              buys {formatMoney(unit.purchases)} · exp {formatMoney(unit.expenses)}
                            </span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all"
                            style={{ width: `${share}%` }}
                            role="presentation"
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Low stock */}
            <Card title="Low stock alerts">
              {summary.low_stock.length === 0 ? (
                <EmptyState message="No low-stock items." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {summary.low_stock.map((entry) => (
                    <li key={entry.item_id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="font-medium text-slate-800">{entry.item_name}</span>
                      <span className="flex items-center gap-3 text-slate-600">
                        <span className="tabular-nums">
                          {entry.current_stock}/{entry.min_stock_level} {entry.base_unit}
                        </span>
                        <Badge tone={entry.status as StockStatus}>{entry.status}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Top selling */}
            <Card title="Top selling">
              {summary.top_selling.length === 0 ? (
                <EmptyState message="No sales recorded in this period yet." />
              ) : (
                <ol className="divide-y divide-slate-100">
                  {summary.top_selling.map((entry, index) => (
                    <li key={entry.item_id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="mr-2 text-xs font-bold text-indigo-600">#{index + 1}</span>
                        <span className="font-medium text-slate-800">{entry.item_name}</span>
                      </span>
                      <span className="shrink-0 text-slate-600 tabular-nums">
                        {entry.quantity_sold} sold · {formatMoney(entry.revenue)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          {/* Recent activity */}
          <Card title="Recent activity">
            {summary.recent_activity.length === 0 ? (
              <EmptyState message="Nothing recorded yet — start with a purchase or sale." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {summary.recent_activity.map((entry, index) => (
                  <li key={`${entry.number}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="flex items-center gap-2">
                      <Badge tone={entry.type === 'sale' ? 'healthy' : entry.type === 'purchase' ? 'low' : 'neutral'}>
                        {entry.type}
                      </Badge>
                      <span className="font-medium text-slate-800">{entry.label}</span>
                      <span className="text-xs text-slate-400">{entry.number}</span>
                    </span>
                    <span className="flex items-center gap-3 text-slate-500 tabular-nums">
                      {formatMoney(entry.amount)}
                      <span className="text-xs text-slate-400">
                        {new Date(entry.at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
