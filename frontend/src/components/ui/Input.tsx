import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/utils/cn'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label?: string
  error?: string | null
  hint?: string
  leading?: ReactNode
  trailing?: ReactNode
  ref?: Ref<HTMLInputElement>
}

export function Input({
  label,
  error,
  hint,
  leading,
  trailing,
  className,
  ref,
  ...rest
}: InputProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
          {label}
        </label>
      )}
      <div className="relative">
        {leading && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--color-muted)] pointer-events-none">
            {leading}
          </div>
        )}
        <input
          id={id}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            'block w-full rounded-xl bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-muted)] transition-all',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent',
            error
              ? 'border-[var(--color-destructive)] bg-[var(--color-destructive-muted)]'
              : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
            leading ? 'pl-10' : '',
            trailing ? 'pr-10' : '',
            className,
          )}
          {...rest}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-muted)]">{trailing}</div>
        )}
      </div>
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-[var(--color-text-secondary)]">{hint}</p>}
      {error && <p id={errorId} role="alert" className="mt-1.5 text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  )
}

interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label?: string
  error?: string | null
  hint?: string
}

export function Textarea({ label, error, hint, className, ...rest }: TextareaProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
          {label}
        </label>
      )}
      <textarea
        id={id}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          'block w-full rounded-xl bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-muted)] transition-all resize-y min-h-[100px]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent',
          error
            ? 'border-[var(--color-destructive)] bg-[var(--color-destructive-muted)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
          className,
        )}
        {...rest}
      />
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-[var(--color-text-secondary)]">{hint}</p>}
      {error && <p id={errorId} role="alert" className="mt-1.5 text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  )
}

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode
}

export function Label({ className, children, ...rest }: LabelProps) {
  return (
    <label className={cn('block text-sm font-medium text-[var(--color-text-primary)]', className)} {...rest}>
      {children}
    </label>
  )
}