import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Legacy props used by existing screens. */
  title?: string
  action?: ReactNode
  children: ReactNode
}

const variantClasses = {
  default: 'bg-[var(--color-surface)] border border-[var(--color-border)]',
  elevated: 'bg-[var(--color-surface-elevated)] shadow-[var(--shadow-md)] border border-[var(--color-border)]',
  outlined: 'bg-transparent border-2 border-[var(--color-border-strong)]',
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({
  variant = 'default',
  padding = 'md',
  title,
  action,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
      {...rest}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-4', className)}>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] truncate">{title}</h3>
        {subtitle && <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function CardContent({ className, children, ...rest }: CardContentProps) {
  return (
    <div className={cn('', className)} {...rest}>
      {children}
    </div>
  )
}

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function CardFooter({ className, children, ...rest }: CardFooterProps) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[var(--color-border)]', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  message,
  action,
  className,
}: {
  icon?: ReactNode
  title?: string
  description?: string
  /** Legacy prop used by existing screens. */
  message?: string
  action?: ReactNode
  className?: string
}) {
  const heading = title ?? message ?? 'Nothing here yet'
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}>
      {icon && <div className="text-[var(--color-muted)] mb-3">{icon}</div>}
      <h4 className="text-base font-medium text-[var(--color-text-primary)]">{heading}</h4>
      {description && <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}