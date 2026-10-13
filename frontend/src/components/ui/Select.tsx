import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label?: string
  error?: string | null
  hint?: string
  placeholder?: string
}

export function Select({ label, error, hint, placeholder, className, children, ...rest }: SelectProps) {
  const id = useId()

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          'block w-full rounded-xl border bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] transition-all min-h-[48px]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent',
          error
            ? 'border-[var(--color-destructive)] bg-[var(--color-destructive-muted)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
          'disabled:bg-[var(--color-bg-tertiary)] disabled:text-[var(--color-muted)] disabled:cursor-not-allowed',
          className,
        )}
        {...rest}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {children}
      </select>
      {hint && !error && <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">{hint}</p>}
      {error && <p role="alert" className="mt-1.5 text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  )
}

/* Badge text uses dark shades on tinted backgrounds for 4.5:1 contrast. */
const badgeVariants = {
  default: 'bg-[#e2e8f0] text-[#1e293b]',
  primary: 'bg-[var(--color-info-muted)] text-[#1e40af]',
  success: 'bg-[var(--color-accent-muted)] text-[#065f46]',
  warning: 'bg-[var(--color-warning-muted)] text-[#92400e]',
  destructive: 'bg-[var(--color-destructive-muted)] text-[#991b1b]',
  outline: 'bg-transparent text-[var(--color-text-secondary)] border border-[var(--color-border)]',
} as const

type BadgeVariant = keyof typeof badgeVariants

const toneToVariant: Record<string, BadgeVariant> = {
  healthy: 'success',
  low: 'warning',
  out: 'destructive',
  neutral: 'default',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
  default: 'default',
  primary: 'primary',
  outline: 'outline',
}

interface BadgeProps {
  variant?: BadgeVariant
  /** Legacy alias used across existing screens. */
  tone?: string
  size?: 'sm' | 'md'
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'default', tone, size = 'md', children, className }: BadgeProps) {
  const resolved = (tone && toneToVariant[tone]) || variant
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full capitalize',
        badgeVariants[resolved],
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        className,
      )}
    >
      {children}
    </span>
  )
}

interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

const statusColors: Record<string, BadgeVariant> = {
  pending: 'default',
  preparing: 'warning',
  ready: 'success',
  served: 'success',
  cancelled: 'destructive',
  free: 'success',
  occupied: 'destructive',
  healthy: 'success',
  low: 'warning',
  out: 'destructive',
  open: 'primary',
  closed: 'default',
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const variant = statusColors[status.toLowerCase()] ?? 'default'
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()

  return <Badge variant={variant} size={size}>{label}</Badge>
}