import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { getSettings, updateSettings } from '@/services/settings'
import type { BusinessSettings } from '@/services/settings'

const MAX_LOGO_BYTES = 700_000

export function BusinessPanel() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const [settings, setSettings] = useState<BusinessSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [pendingLogo, setPendingLogo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [logoOk, setLogoOk] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      const s = await getSettings()
      setSettings(s)
      setName(s.business_name)
      setLogoOk(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load business settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (PNG, JPEG, WebP, GIF or SVG).')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`That image is too large (${Math.round(file.size / 1000)} KB). Keep it under ${MAX_LOGO_BYTES / 1000} KB.`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const uri = String(reader.result ?? '')
      setPendingLogo(uri)
      setLogoPreview(uri)
      setLogoOk(true)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsDataURL(file)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Enter the business name.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const s = await updateSettings({
        business_name: name.trim(),
        ...(pendingLogo ? { logo_data_uri: pendingLogo } : {}),
      })
      setSettings(s)
      setPendingLogo(null)
      setLogoPreview(null)
      setLogoOk(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setPending(false)
    }
  }

  async function handleRemoveLogo() {
    setPending(true)
    setError(null)
    try {
      const s = await updateSettings({ remove_logo: true })
      setSettings(s)
      setPendingLogo(null)
      setLogoPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the logo.')
    } finally {
      setPending(false)
    }
  }

  const shownLogo = logoPreview ?? settings?.logo_url ?? null

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Shown on receipts and bills. The logo is stored with your data and served from a stable
        address — if it is missing, receipts fall back to the business name.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sharma Bhojanalaya"
            maxLength={120}
            autoComplete="off"
            disabled={!isOwner}
          />

          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">Receipt logo</span>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {shownLogo && logoOk ? (
                  <img
                    src={shownLogo}
                    alt="Business logo preview"
                    className="max-h-full max-w-full object-contain"
                    onError={() => setLogoOk(false)}
                  />
                ) : (
                  <span className="px-2 text-center text-[11px] font-semibold text-slate-400">
                    {(settings?.business_name ?? name ?? 'No logo').slice(0, 18)}
                  </span>
                )}
              </div>
              {isOwner && (
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label="Upload logo"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                    {settings?.has_logo || pendingLogo ? 'Replace logo' : 'Upload logo'}
                  </Button>
                  {(settings?.has_logo || pendingLogo) && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void handleRemoveLogo()}>
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </div>
            {!isOwner && (
              <p className="mt-1 text-xs text-slate-400">Only owners can change business settings.</p>
            )}
          </div>

          {isOwner && (
            <div className="flex justify-end">
              <Button type="submit" pending={pending}>
                Save
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
