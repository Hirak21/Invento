import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import {
  createExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
  renameExpenseCategory,
} from '@/services/expenses'
import type { ExpenseCategoryInfo } from '@/types/expense'
import { EXPENSE_CATEGORIES } from '@/types/expense'

/**
 * Manage expense categories (incl. Staff Salary). Custom categories can be
 * added/renamed; deleting one that has expense records deactivates it so
 * history stays intact.
 */
export function ExpenseCategoriesPanel() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const [categories, setCategories] = useState<ExpenseCategoryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ value: string; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const cats = await listExpenseCategories()
      setCategories(cats)
      // Server marks built-ins; fall back to the known list.
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load expense categories.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      const created = await createExpenseCategory(name.trim())
      setCategories((current) =>
        [...current, { ...created, builtIn: false }].sort((a, b) => a.label.localeCompare(b.label)),
      )
      setName('')
      setNotice(`Category “${created.label}” added.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create category.')
    } finally {
      setPending(false)
    }
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault()
    if (!editing || !editing.label.trim()) return
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      const renamed = await renameExpenseCategory(editing.value, editing.label.trim())
      setCategories((current) =>
        current.map((c) => (c.value === renamed.value ? renamed : c)),
      )
      setEditing(null)
      setNotice(`Category renamed to “${renamed.label}”.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename category.')
    } finally {
      setPending(false)
    }
  }

  async function handleDelete(category: ExpenseCategoryInfo) {
    if (!window.confirm(
      `Delete “${category.label}”? Expenses already recorded under it are kept and stay visible in history.`,
    )) return
    setError(null)
    setNotice(null)
    try {
      await deleteExpenseCategory(category.value)
      setCategories((current) => current.filter((c) => c.value !== category.value))
      setNotice(`Category “${category.label}” removed. Existing records are preserved.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete category.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Categories for the expense form — Staff Salary is included by default. Custom
        categories appear in the expense entry selector immediately.
      </p>

      {isOwner && (
        <form onSubmit={handleCreate} className="flex items-end gap-2">
          <Input
            label="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Festival Gifts"
            required
            maxLength={60}
          />
          <Button type="submit" pending={pending} className="shrink-0">
            Add
          </Button>
        </form>
      )}

      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
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
          No expense categories found.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {categories.map((category) => {
            const isBuiltIn = category.builtIn ?? EXPENSE_CATEGORIES.some((c) => c.value === category.value)
            const isEditing = editing?.value === category.value
            return (
              <li key={category.value} className="flex items-center justify-between gap-2 px-4 py-2.5">
                {isEditing ? (
                  <form onSubmit={handleRename} className="flex flex-1 items-end gap-2">
                    <Input
                      label=""
                      aria-label="Category name"
                      value={editing.label}
                      onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                      maxLength={60}
                      required
                    />
                    <Button type="submit" size="sm" pending={pending}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 text-sm font-medium text-slate-800">
                      {category.label}
                      {isBuiltIn && (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Default
                        </span>
                      )}
                    </span>
                    {isOwner && !isBuiltIn && (
                      <span className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ value: category.value, label: category.label })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void handleDelete(category)}>
                          Delete
                        </Button>
                      </span>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
