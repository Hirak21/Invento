import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils/cn'
import { Button } from './Button'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  handle?: boolean
  className?: string
  action?: ReactNode
  /** 'half' anchors a ~half-viewport sheet on mobile (scrolls internally). */
  height?: 'auto' | 'half' | 'tall'
  /** When true, scrolling the content grows the sheet upward to near-full. */
  expandable?: boolean
  /** When true, the sheet opens at the tall snap point immediately. */
  startExpanded?: boolean
}

export function BottomSheet({ open, onClose, title, children, handle = true, className, action, height = 'auto', expandable = false, startExpanded = false }: BottomSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  // Same ref indirection as Modal: typing re-renders the parent with a new
  // onClose identity, which must not reset sheet state mid-interaction.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Fresh snap point on every open; scrolling down grows the sheet upward.
  useEffect(() => {
    if (open) setExpanded(startExpanded)
  }, [open, startExpanded])

  useEffect(() => {
    if (!open) return

    previousActiveElement.current = document.activeElement as HTMLElement

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      previousActiveElement.current?.focus()
    }
  }, [open])

  if (!open) return null

  const sheetContent = (
    <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end md:justify-center md:items-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="bottom-sheet-title">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={contentRef}
        className={cn(
          'relative w-full bg-[var(--color-surface)] rounded-t-2xl md:rounded-2xl shadow-[var(--shadow-xl)] animate-slide-up',
          'flex flex-col overflow-hidden transition-[height] duration-300 ease-out',
          expanded
            ? 'h-[88dvh] md:h-auto md:max-h-[85dvh]'
            : height === 'half'
              ? 'h-[64dvh] md:h-auto md:max-h-[85dvh]'
              : height === 'tall'
                ? 'max-h-[88dvh] md:max-h-[85dvh]'
                : 'max-h-[85dvh]',
          'md:max-w-2xl md:mx-auto',
          className,
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-surface)] z-10">
          {handle && <div className="w-8 h-1 bg-[var(--color-border)] rounded-full" aria-hidden="true" />}
          <h2 id="bottom-sheet-title" className="text-base font-semibold text-[var(--color-text-primary)] flex-1 text-center">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 p-2 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors min-h-[44px] min-w-[44px]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          onScroll={(e) => {
            if (expandable && !expanded && e.currentTarget.scrollTop > 48) setExpanded(true)
          }}
        >
          {children}
        </div>
        {action && (
          <div className="px-4 py-3 border-t border-[var(--color-border)] sticky bottom-0 bg-[var(--color-surface)] safe-bottom">
            {action}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(sheetContent, document.body)
}

interface ActionSheetItem {
  label: string
  onClick: () => void
  variant?: 'default' | 'destructive'
  icon?: ReactNode
  disabled?: boolean
}

interface ActionSheetProps {
  open: boolean
  onClose: () => void
  title: string
  items: ActionSheetItem[]
  cancelLabel?: string
}

export function ActionSheet({ open, onClose, title, items, cancelLabel = 'Cancel' }: ActionSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="space-y-2">
        {items.map((item, index) => (
          <Button
            key={index}
            variant={item.variant === 'destructive' ? 'destructive' : 'secondary'}
            fullWidth
            onClick={() => {
              item.onClick()
              onClose()
            }}
            disabled={item.disabled}
            leftIcon={item.icon}
            className="justify-start gap-3 text-left"
          >
            {item.label}
          </Button>
        ))}
        <Button variant="ghost" fullWidth onClick={onClose} className="mt-2">
          {cancelLabel}
        </Button>
      </div>
    </BottomSheet>
  )
}