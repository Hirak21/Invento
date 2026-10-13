import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'danger' | 'ghost' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Legacy alias used across existing screens — maps to `loading`. */
  pending?: boolean
  /** Optional haptic feedback on tap (mobile). No-op where unsupported. */
  haptic?: 'light' | 'medium' | 'heavy' | boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  /* Primary uses dark green for 4.5:1 white-text contrast. */
  primary: 'bg-[#047857] text-white hover:bg-[#065f46] border border-transparent',
  secondary: 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:bg-[var(--color-secondary-hover)] border border-transparent',
  destructive: 'bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:bg-[var(--color-destructive-hover)] border border-transparent',
  danger: 'bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:bg-[var(--color-destructive-hover)] border border-transparent',
  ghost: 'bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] border border-transparent',
  outline: 'bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] border border-[var(--color-border-strong)]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm gap-1.5 min-h-[44px]',
  md: 'px-4 py-2.5 text-sm gap-2 min-h-[48px]',
  lg: 'px-6 py-3 text-base gap-2 min-h-[52px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  pending = false,
  haptic,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  disabled,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const busy = loading || pending
  return (
    <button
      type={type}
      disabled={disabled || busy}
      onClick={(e) => {
        if (haptic && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            const pattern = haptic === 'heavy' ? 25 : haptic === 'medium' ? 15 : 8
            navigator.vibrate(pattern)
          } catch {
            /* ignore */
          }
        }
        onClick?.(e)
      }}
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-xl transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-primary)]',
        'active:scale-[0.98]',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {busy && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!busy && leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
      {children}
      {!busy && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  )
}