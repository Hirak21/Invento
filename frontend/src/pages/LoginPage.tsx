import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { needsBootstrap } from '@/services/auth'

export function LoginPage() {
  const { user, loading, login, bootstrapOwner } = useAuth()
  const navigate = useNavigate()

  const [bootstrapNeeded, setBootstrapNeeded] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function checkBootstrap() {
      try {
        const needed = await needsBootstrap()
        if (!cancelled) setBootstrapNeeded(needed)
      } catch {
        if (!cancelled) {
          setBootstrapNeeded(false)
          setError('Cannot reach the server. Is the backend running?')
        }
      }
    }
    void checkBootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="size-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (bootstrapNeeded && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setPending(true)
    try {
      if (bootstrapNeeded) {
        await bootstrapOwner(username.trim(), password)
      } else {
        await login(username.trim(), password)
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      // Values intentionally preserved so the user can correct and retry.
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-indigo-700">Invento Lite</h1>
          <p className="mt-1 text-sm text-slate-500">
            {bootstrapNeeded
              ? 'Create the owner account to get started.'
              : 'Sign in to manage your business.'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <Input
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            minLength={3}
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={bootstrapNeeded ? 'new-password' : 'current-password'}
            required
            minLength={8}
            hint={bootstrapNeeded ? 'At least 8 characters.' : undefined}
          />
          {bootstrapNeeded && (
            <Input
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" pending={pending} className="w-full">
            {bootstrapNeeded ? 'Create owner account' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
