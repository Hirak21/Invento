import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/utils/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  action?: ReactNode
  children: ReactNode
}

export function Card({ title, action, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-lg border border-slate-200 bg-white p-5', className)}
      {...rest}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}
