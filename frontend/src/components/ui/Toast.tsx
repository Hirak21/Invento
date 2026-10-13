import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
  duration?: number
  action?: ReactNode
}

const toasts: Toast[] = []
let listeners: Set<() => void> = new Set()

function notify() {
  listeners.forEach((l) => l())
}

export function toast(toast: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2)
  const newToast = { ...toast, id }
  toasts.push(newToast)
  notify()

  if (toast.duration !== 0) {
    setTimeout(() => {
      const idx = toasts.findIndex((t) => t.id === id)
      if (idx !== -1) {
        toasts.splice(idx, 1)
        notify()
      }
    }, toast.duration ?? 4000)
  }

  return id
}

export function useToasts() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const listener = () => setTick((t) => t + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return {
    toasts: [...toasts].reverse(),
    dismiss: (id: string) => {
      const idx = toasts.findIndex((t) => t.id === id)
      if (idx !== -1) {
        toasts.splice(idx, 1)
        notify()
      }
    },
    toast,
  }
}

const variantStyles = {
  default: 'bg-[var(--color-surface)] border-[var(--color-border)]',
  success: 'bg-[var(--color-accent-muted)] border-[var(--color-accent)]',
  error: 'bg-[var(--color-destructive-muted)] border-[var(--color-destructive)]',
  warning: 'bg-[var(--color-warning-muted)] border-[var(--color-warning)]',
}

const variantIcons = {
  default: (
    <svg className="w-5 h-5 text-[var(--color-info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  success: (
    <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-[var(--color-destructive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 text-[var(--color-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, dismiss } = useToasts()

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 pointer-events-none safe-bottom" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-[var(--shadow-lg)] animate-slide-up min-w-[280px] max-w-[360px]',
              variantStyles[t.variant ?? 'default'],
            )}
            role="alert"
          >
            <div className="flex-shrink-0 mt-0.5">{variantIcons[t.variant ?? 'default']}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{t.title}</p>
              {t.description && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{t.description}</p>}
              {t.action && <div className="mt-2">{t.action}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 p-1 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </>
  )
}