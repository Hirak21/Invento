import { EmptyState } from '@/components/ui/Card'

interface PlaceholderPageProps {
  title: string
  message: string
}

export function PlaceholderPage({ title, message }: PlaceholderPageProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <EmptyState message={message} />
    </div>
  )
}
