import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

/**
 * Standard page header — one size, one rhythm, every page.
 * Title: text-xl on phones, text-2xl on desktop. Actions (e.g. "+ New…")
 * sit right of the title and wrap below on narrow screens.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] md:text-2xl">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
