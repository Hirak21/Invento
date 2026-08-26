import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { listBusinessUnits } from '@/services/masterData'

const STORAGE_KEY = 'invento_selected_bu'

interface BusinessUnitContextValue {
  selectedBuId: string | null
  setSelectedBuId: (id: string | null) => void
}

const BusinessUnitContext = createContext<BusinessUnitContextValue | null>(null)

export function BusinessUnitProvider({ children }: { children: ReactNode }) {
  const [selectedBuId, setSelectedBuIdState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )

  const setSelectedBuId = useCallback((id: string | null) => {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
    setSelectedBuIdState(id)
  }, [])

  // Clear stored selection once on mount if it no longer matches a real unit.
  useEffect(() => {
    if (!selectedBuId) return
    let cancelled = false
    listBusinessUnits()
      .then((units) => {
        if (!cancelled && !units.some((u) => u.id === selectedBuId)) {
          localStorage.removeItem(STORAGE_KEY)
          setSelectedBuIdState(null)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [selectedBuId])

  const value = useMemo(() => ({ selectedBuId, setSelectedBuId }), [selectedBuId, setSelectedBuId])
  return <BusinessUnitContext.Provider value={value}>{children}</BusinessUnitContext.Provider>
}

export function useBusinessUnit(): BusinessUnitContextValue {
  const ctx = useContext(BusinessUnitContext)
  if (!ctx) throw new Error('useBusinessUnit must be used inside <BusinessUnitProvider>')
  return ctx
}
