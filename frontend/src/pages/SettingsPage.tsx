import { useState } from 'react'

import { cn } from '@/utils/cn'
import { BusinessUnitsPanel } from '@/features/settings/BusinessUnitsPanel'
import { BusinessPanel } from '@/features/settings/BusinessPanel'
import { CategoriesPanel } from '@/features/settings/CategoriesPanel'
import { SuppliersPanel } from '@/features/settings/SuppliersPanel'

const TABS = [
  { id: 'business', label: 'Business' },
  { id: 'units', label: 'Business Units' },
  { id: 'categories', label: 'Categories' },
  { id: 'suppliers', label: 'Suppliers' },
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('business')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Master data for your business.</p>
      </div>

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 sm:w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none',
              tab === t.id
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        {tab === 'business' && <BusinessPanel />}
        {tab === 'units' && <BusinessUnitsPanel />}
        {tab === 'categories' && <CategoriesPanel />}
        {tab === 'suppliers' && <SuppliersPanel />}
      </section>
    </div>
  )
}
