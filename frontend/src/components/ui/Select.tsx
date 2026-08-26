import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

import { cn } from '@/utils/cn'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label?: string
  error?: string | null
  hint?: string
}

const baseClasses =
  'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400'

export function Select({ label, error, hint, className, children, ...rest }: SelectProps) {
  const id = useId()
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <select id={id} className={cn(baseClasses, error ? 'border-red-400' : 'border-slate-300', className)} {...rest}>
        {children}
      </select>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

const badgeStyles = {
  healthy: 'bg-emerald-50 text-emerald-700',
  low: 'bg-amber-50 text-amber-700',
  out: 'bg-red-50 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
} as const

export function Badge({
  tone,
  children,
}: {
  tone: keyof typeof badgeStyles
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        badgeStyles[tone],
      )}
    >
      {children}
    </span>
  )
}
