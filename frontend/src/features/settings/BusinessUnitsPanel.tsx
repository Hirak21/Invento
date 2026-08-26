import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { createBusinessUnit, listBusinessUnits, updateBusinessUnit } from '@/services/masterData'
import type { BusinessUnit } from '@/types/master'

export function BusinessUnitsPanel() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const [units, setUnits] = useState<BusinessUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function reload() {
    setLoading(true)
    try {
      setUnits(await listBusinessUnits())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load business units.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await createBusinessUnit(name.trim(), location.trim() || undefined)
      setName('')
      setLocation('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create business unit.')
    } finally {
      setPending(false)
    }
  }

  async function toggleActive(unit: BusinessUnit) {
    await updateBusinessUnit(unit.id, { active: !unit.active })
    await reload()
  }

  async function saveRename(id: string) {
    if (!editName.trim()) return
    try {
      await updateBusinessUnit(id, { name: editName.trim() })
      setEditingId(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Your restaurant and shop live side by side here — reports and stock stay separate.
      </p>

      {isOwner && (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Restaurant"
            required
            minLength={1}
            maxLength={80}
          />
          <Input
            label="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. MG Road"
            maxLength={200}
          />
          <Button type="submit" pending={pending} className="sm:mb-0.5">
            Add unit
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : units.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
          No business units yet. Add your Restaurant and Shop above to get started.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {units.map((unit) => (
            <li key={unit.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                {editingId === unit.id ? (
                  <span className="flex items-center gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      autoFocus
                    />
                    <Button size="sm" onClick={() => saveRename(unit.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-slate-900">{unit.name}</span>
                    {unit.location && (
                      <span className="ml-2 text-sm text-slate-400">{unit.location}</span>
                    )}
                    {!unit.active && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        Inactive
                      </span>
                    )}
                  </>
                )}
              </div>
              {isOwner && editingId !== unit.id && (
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(unit.id)
                      setEditName(unit.name)
                    }}
                  >
                    Rename
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(unit)}>
                    {unit.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
