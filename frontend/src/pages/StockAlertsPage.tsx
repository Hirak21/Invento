import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/Card'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import { listStockAlerts } from '@/services/stockAlerts'
import type { StockAlert } from '@/types/stockAlert'
import { Badge } from '@/components/ui/Select'

export function StockAlertsPage() {
  const { selectedBuId } = useBusinessUnit()
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listStockAlerts({
        business_unit_id: selectedBuId || undefined,
        include_out_of_stock: true,
      })
      setAlerts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load stock alerts.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId])

  useEffect(() => {
    void loadAlerts()
  }, [loadAlerts])

  const outOfStock = alerts.filter((a) => a.status === 'out')
  const lowStock = alerts.filter((a) => a.status === 'low')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Stock Alerts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Items that are running low or have run out.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={loadAlerts} pending={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="size-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <span className="ml-3 text-sm text-slate-500">Checking stock levels…</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState message="No items are running low or out of stock." />
      ) : (
        <div className="space-y-4">
          {outOfStock.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-red-700">Out of stock ({outOfStock.length})</h2>
              <div className="divide-y divide-slate-200">
                {outOfStock.map((alert) => (
                  <Card key={alert.item_id} className="bg-red-50/50 border-red-200">
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-slate-900">{alert.item_name}</h3>
                          <Badge tone="out">Out of stock</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Current: <strong>0 {alert.base_unit}</strong>
                          <span className="mx-1 text-slate-300">·</span>
                          Min level: <strong>{alert.min_stock_level} {alert.base_unit}</strong>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-600">
                          Suggested reorder:{' '}
                          <span className="font-semibold text-slate-900">
                            {alert.suggested_reorder_qty} {alert.base_unit}
                          </span>
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {lowStock.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-amber-700">Low stock ({lowStock.length})</h2>
              <div className="divide-y divide-slate-200">
                {lowStock.map((alert) => (
                  <Card key={alert.item_id} className="bg-amber-50/50 border-amber-200">
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-slate-900">{alert.item_name}</h3>
                          <Badge tone="low">Low stock</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Current: <strong>{alert.current_stock} {alert.base_unit}</strong>
                          <span className="mx-1 text-slate-300">·</span>
                          Min level: <strong>{alert.min_stock_level} {alert.base_unit}</strong>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-600">
                          Suggested reorder:{' '}
                          <span className="font-semibold text-slate-900">
                            {alert.suggested_reorder_qty} {alert.base_unit}
                          </span>
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
