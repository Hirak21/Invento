import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

interface PlaceholderPageProps {
  title: string
  message: string
}

export function PlaceholderPage({ title, message }: PlaceholderPageProps) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <EmptyState message={message} />
    </div>
  )
}
