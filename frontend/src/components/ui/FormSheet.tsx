import type { ReactNode } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { Modal } from '@/components/ui/Modal'
import { useIsMobile } from '@/hooks/useMediaQuery'

interface FormSheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Sticky bottom action bar (one-handed reach) inside the sheet. */
  action?: ReactNode
  /** Open at the tall snap point immediately (no scroll needed). */
  startExpanded?: boolean
}

/**
 * Compact bottom-aligned sheet on mobile (~half viewport, internally
 * scrollable) and a centered modal on desktop. Shared by New Sale and
 * New Purchase so both workflows feel identical.
 */
export function FormSheet({ open, title, onClose, children, action, startExpanded = false }: FormSheetProps) {
  const isMobile = useIsMobile()

  if (!open) return null

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title={title} height="half" expandable startExpanded={startExpanded} action={action}>
        {children}
      </BottomSheet>
    )
  }

  return (
    <Modal open={open} title={title} onClose={onClose} wide>
      <div className="space-y-4">
        {children}
        {action && <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">{action}</div>}
      </div>
    </Modal>
  )
}
