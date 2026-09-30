import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { listBusinessUnits } from '@/services/masterData'
import type { BusinessUnit } from '@/types/master'

const STORAGE_KEY = 'invento_selected_bu'

type BuStatus = 'validating' | 'ready' | 'error'

interface BusinessUnitContextValue {
  selectedBuId: string | null
  setSelectedBuId: (id: string | null) => void
  units: BusinessUnit[]
  buStatus: BuStatus
  buError: string | null
  refreshUnits: () => void
}

const BusinessUnitContext = createContext<BusinessUnitContextValue | null>(null)

export function BusinessUnitProvider({ children }: { children: ReactNode }) {
  const [selectedBuId, setSelectedBuIdState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )
  const [units, setUnits] = useState<BusinessUnit[]>([])
  const [buStatus, setBuStatus] = useState<BuStatus>('validating')
  const [buError, setBuError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const setSelectedBuId = useCallback((id: string | null) => {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
    setSelectedBuIdState(id)
  }, [])

  const refreshUnits = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  // Fetch once per version. Validate the persisted ID against the fresh list.
  // Never leaves a stale/invalid ID in place once units are known.
  useEffect(() => {
    let cancelled = false
    setBuStatus('validating')
    setBuError(null)
    listBusinessUnits()
      .then((fresh) => {
        if (cancelled) return
        setUnits(fresh)
        setBuStatus('ready')
        setSelectedBuIdState((prev) => {
          if (prev && !fresh.some((u) => u.id === prev)) {
            localStorage.removeItem(STORAGE_KEY)
            return null
          }
          return prev
        })
      })
      .catch((err) => {
        if (cancelled) return
        setBuStatus('error')
        setBuError(err instanceof Error ? err.message : 'Could not load business units.')
      })
    return () => {
      cancelled = true
    }
  }, [version])

  const value = useMemo(
    () => ({ selectedBuId, setSelectedBuId, units, buStatus, buError, refreshUnits }),
    [selectedBuId, setSelectedBuId, units, buStatus, buError, refreshUnits],
  )
  return <BusinessUnitContext.Provider value={value}>{children}</BusinessUnitContext.Provider>
}

export function useBusinessUnit(): BusinessUnitContextValue {
  const ctx = useContext(BusinessUnitContext)
  if (!ctx) throw new Error('useBusinessUnit must be used inside <BusinessUnitProvider>')
  return ctx
}
