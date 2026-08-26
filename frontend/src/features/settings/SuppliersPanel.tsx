import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { createSupplier, listSuppliers, updateSupplier } from '@/services/masterData'
import type { Supplier } from '@/types/master'

export function SuppliersPanel() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      setSuppliers(await listSuppliers(true))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load suppliers.')
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
      await createSupplier({ name: name.trim(), phone: phone.trim() || undefined })
      setName('')
      setPhone('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create supplier.')
    } finally {
      setPending(false)
    }
  }

  async function toggleActive(supplier: Supplier) {
    try {
      await updateSupplier(supplier.id, { active: !supplier.active })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update supplier.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Suppliers you buy stock from. You can attach them to purchases later.
      </p>

      {isOwner && (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="Supplier name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Metro Cash & Carry"
            required
            maxLength={120}
          />
          <Input
            label="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
          />
          <Button type="submit" pending={pending}>
            Add
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
      ) : suppliers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
          No suppliers yet. Add your first supplier above.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {suppliers.map((supplier) => (
            <li key={supplier.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium text-slate-800">
                {supplier.name}
                {supplier.phone && (
                  <span className="ml-2 text-sm font-normal text-slate-400">{supplier.phone}</span>
                )}
                {!supplier.active && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Inactive
                  </span>
                )}
              </span>
              {isOwner && (
                <Button size="sm" variant="ghost" onClick={() => toggleActive(supplier)}>
                  {supplier.active ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
