import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { changeCredentials } from '@/services/auth'

export function AccountPanel() {
  const { user, updateUser } = useAuth()
  const [username, setUsername] = useState(user?.username ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const trimmed = username.trim().toLowerCase()
    const wantsUser = trimmed !== (user?.username ?? '')
    const wantsPassword = newPassword.length > 0

    if (!currentPassword) {
      setError('Enter your current password.')
      return
    }
    if (!wantsUser && !wantsPassword) {
      setError('Change your username or enter a new password.')
      return
    }
    if (wantsUser && trimmed.length < 3) {
      setError('Username must be at least 3 characters.')
      return
    }
    if (wantsPassword) {
      if (newPassword.length < 8) {
        setError('New password must be at least 8 characters.')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match.')
        return
      }
    }

    setPending(true)
    try {
      const updated = await changeCredentials({
        current_password: currentPassword,
        ...(wantsUser ? { new_username: trimmed } : {}),
        ...(wantsPassword ? { new_password: newPassword } : {}),
      })
      updateUser(updated)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Credentials updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update credentials.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Account</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Change your username or password. Your current password is always required.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={32}
          autoComplete="username"
        />
        <Input
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          hint="Leave blank to keep your current password. At least 8 characters."
          autoComplete="new-password"
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-emerald-600" role="status">
            {success}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </div>
  )
}
