import { useState } from 'react'

import { cn } from '@/utils/cn'
import { PageHeader } from '@/components/ui/PageHeader'
import { BusinessUnitsPanel } from '@/features/settings/BusinessUnitsPanel'
import { BusinessPanel } from '@/features/settings/BusinessPanel'
import { CategoriesPanel } from '@/features/settings/CategoriesPanel'
import { ExpenseCategoriesPanel } from '@/features/settings/ExpenseCategoriesPanel'
import { SuppliersPanel } from '@/features/settings/SuppliersPanel'

const TABS = [
  { id: 'business', label: 'Business' },
  { id: 'units', label: 'Business Units' },
  { id: 'categories', label: 'Categories' },
  { id: 'expense-categories', label: 'Expense Categories' },
  { id: 'suppliers', label: 'Suppliers' },
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('business')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Master data for your business."
      />

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 sm:w-fit">
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
        {tab === 'expense-categories' && <ExpenseCategoriesPanel />}
        {tab === 'suppliers' && <SuppliersPanel />}
      </section>
    </div>
  )
}
