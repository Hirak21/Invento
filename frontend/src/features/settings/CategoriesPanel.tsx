import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { createCategory, listCategories, updateCategory } from '@/services/masterData'
import type { Category } from '@/types/master'

export function CategoriesPanel() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      setCategories(await listCategories(true))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load categories.')
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
      await createCategory(name.trim())
      setName('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create category.')
    } finally {
      setPending(false)
    }
  }

  async function toggleActive(category: Category) {
    try {
      await updateCategory(category.id, { active: !category.active })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update category.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Group items into categories like Beverages, Vegetables, or Stationery.
      </p>

      {isOwner && (
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <Input
            label="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Beverages"
            required
            maxLength={80}
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
      ) : categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
          No categories yet. Add your first category above.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium text-slate-800">
                {category.name}
                {!category.active && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Inactive
                  </span>
                )}
              </span>
              {isOwner && (
                <Button size="sm" variant="ghost" onClick={() => toggleActive(category)}>
                  {category.active ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
