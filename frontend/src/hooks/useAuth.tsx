import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { clearToken } from '@/services/auth'
import { bootstrapOwner as apiBootstrapOwner, fetchCurrentUser, login as apiLogin } from '@/services/auth'
import type { User } from '@/types/user'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  bootstrapOwner: (username: string, password: string) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function restoreSession() {
      const token = localStorage.getItem('invento_token')
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const current = await fetchCurrentUser()
        if (!cancelled) setUser(current)
      } catch {
        if (!cancelled) clearToken()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const loggedIn = await apiLogin(username, password)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const bootstrapOwner = useCallback(async (username: string, password: string) => {
    const created = await apiBootstrapOwner(username, password)
    setUser(created)
    return created
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, bootstrapOwner, logout }),
    [user, loading, login, bootstrapOwner, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
