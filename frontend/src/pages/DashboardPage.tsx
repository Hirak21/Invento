import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/Card'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const SUMMARY_CARDS = [
  { title: 'Total Sales', note: 'No sales recorded yet.' },
  { title: 'Purchases', note: 'No purchases recorded yet.' },
  { title: 'Expenses', note: 'No expenses recorded yet.' },
  { title: 'Low Stock', note: 'No inventory items yet.' },
] as const

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {greeting()}, {user?.full_name ?? user?.username}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Here is where your business stands.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SUMMARY_CARDS.map((card) => (
          <Card key={card.title}>
            <p className="text-sm font-medium text-slate-500">{card.title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">—</p>
            <p className="mt-1 text-xs text-slate-400">{card.note}</p>
          </Card>
        ))}
      </div>

      <Card title="Getting started">
        <ol className="list-inside list-decimal space-y-2 text-sm text-slate-600">
          <li>Set up your inventory items in the Inventory section.</li>
          <li>Record your first purchase — stock increases automatically.</li>
          <li>Record a sale — stock decreases and stays traceable.</li>
          <li>Track wastage, expenses, and review reports as you go.</li>
        </ol>
      </Card>
    </div>
  )
}
