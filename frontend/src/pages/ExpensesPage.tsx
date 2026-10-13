import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Select'
import { Select } from '@/components/ui/Select'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import {
  createExpense,
  listExpenses,
  listExpenseCategories,
  setExpensePaymentStatus,
} from '@/services/expenses'
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  formatCategory,
} from '@/types/expense'
import type { Expense, ExpenseCategory, ExpenseCategoryInfo, PaymentMethod } from '@/types/expense'

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ExpensesPage() {
  const { selectedBuId } = useBusinessUnit()
  const [records, setRecords] = useState<Expense[]>([])
  const [totalAmount, setTotalAmount] = useState('0.00')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [category, setCategory] = useState<ExpenseCategory>('supplies')
  const [categories, setCategories] = useState<readonly ExpenseCategoryInfo[]>(EXPENSE_CATEGORIES)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid')
  const [description, setDescription] = useState('')
  const [payee, setPayee] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, setPending] = useState(false)
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([])
  const [dueLoading, setDueLoading] = useState(false)
  const [dueError, setDueError] = useState<string | null>(null)
  const [settlingId, setSettlingId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const amountRef = useRef<HTMLInputElement>(null)
  const formCardRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Failed submits/loads move keyboard/screen-reader focus to the message.
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  // Deep link from Dashboard Quick Actions ("+ Expense"): bring the inline
  // create form into view and focus it, then clear the param.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => amountRef.current?.focus({ preventScroll: true }), 300)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listExpenses({
        business_unit_id: selectedBuId ?? undefined,
        category: categoryFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      })
      setRecords(res.records)
      setTotalAmount(res.total_amount)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load expenses.')
    } finally {
      setLoading(false)
    }
  }, [selectedBuId, categoryFilter, dateFrom, dateTo])

  const loadDue = useCallback(async () => {
    setDueLoading(true)
    setDueError(null)
    try {
      const res = await listExpenses({
        business_unit_id: selectedBuId ?? undefined,
        category: categoryFilter || undefined,
        payment_status: 'pending',
        from: dateFrom || undefined,
        to: dateTo || undefined,
      })
      setPendingExpenses(res.records)
    } catch (err) {
      setDueError(err instanceof Error ? err.message : 'Could not load outstanding dues.')
    } finally {
      setDueLoading(false)
    }
  }, [selectedBuId, categoryFilter, dateFrom, dateTo])

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadDue()])
  }, [load, loadDue])

  async function handleSettle(expense: Expense) {
    setSettlingId(expense.id)
    setDueError(null)
    try {
      await setExpensePaymentStatus(expense.id, 'paid')
      await refreshAll()
    } catch (err) {
      setDueError(err instanceof Error ? err.message : 'Could not update payment status.')
    } finally {
      setSettlingId(null)
    }
  }

  const outstandingTotal = pendingExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadDue()
  }, [loadDue])

  // Category selector is server-driven (Settings can add custom categories).
  useEffect(() => {
    void listExpenseCategories()
      .then((cats) => {
        if (cats.length > 0) setCategories(cats)
      })
      .catch(() => undefined)
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccessMsg(null)
    if (!selectedBuId) return setError('Select a business unit in the top bar first.')
    if (!MONEY_RE.test(amount)) return setError('Enter a valid amount, e.g. 450.00')
    if (!description.trim()) return setError('Describe what the expense was for.')

    setPending(true)
    try {
      const record = await createExpense({
        business_unit_id: selectedBuId,
        category,
        amount,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        description: description.trim(),
        payee: payee.trim() || null,
        date,
        idempotency_key: crypto.randomUUID(),
      })
      setSuccessMsg(
        `Expense ${record.expense_number} recorded — ₹${Number(record.amount).toFixed(2)} for ${formatCategory(record.category, categories)}.`,
      )
      setAmount('')
      setDescription('')
      setPayee('')
      setPaymentStatus('paid')
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the expense.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        description="Where the money went — outside of stock purchases."
      />

      {/* Clear Due — every genuinely pending expense, settled via the backend. */}
      <section aria-label="Clear due" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Clear Due</h2>
            <p className="text-xs text-slate-600">
              {pendingExpenses.length === 0
                ? 'No outstanding expense payments.'
                : `${pendingExpenses.length} pending expense${pendingExpenses.length === 1 ? '' : 's'} outstanding.`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Outstanding</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              ₹{outstandingTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {dueError && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {dueError}
          </p>
        )}

        {dueLoading ? (
          <p className="py-4 text-center text-sm text-slate-500">Loading outstanding dues…</p>
        ) : pendingExpenses.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {pendingExpenses.map((expense) => (
              <li
                key={expense.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-white p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {expense.description}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatDate(expense.spent_at)} · {formatCategory(expense.category, categories)} ·{' '}
                    {expense.expense_number}
                    {' · '}
                    <Badge tone="low" size="sm">pending</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm font-bold tabular-nums text-slate-900">
                    ₹{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleSettle(expense)}
                  pending={settlingId === expense.id}
                  aria-label={`Mark ${expense.expense_number} as paid`}
                  className="shrink-0"
                >
                  Mark paid
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
        <div ref={formCardRef} className="scroll-mt-4">
        <Card title="Record expense">
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">
              <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              label="Amount (₹)"
              ref={amountRef}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="col-span-2 grid grid-cols-2 gap-2.5">
              <Select label="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Payment status"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'pending')}
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Input
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Electricity bill for August"
                maxLength={300}
                required
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Paid to (optional)"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="col-span-2">
              <Button type="submit" pending={pending} className="w-full" size="lg">
                Record expense
              </Button>
            </div>
          </form>
        </Card>
        </div>

        <div className="space-y-3">
          {successMsg && (
            <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {successMsg}
            </p>
          )}
          {!successMsg && error && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              {error}
            </p>
          )}

          <Card
            title="Expenses"
            action={
              records.length > 0 ? (
                <span className="text-xs font-medium text-slate-600">
                  Period total: ₹{Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              ) : undefined
            }
          >
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <div className="col-span-2 sm:col-span-1">
              <Select label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              </div>
            </div>

            {loading ? (
              <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : records.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
                No expenses recorded for this period.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {records.slice(0, 20).map((record) => (
                  <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{record.description}</span>
                      <span className="block text-xs text-slate-400">
                        {formatCategory(record.category, categories)}
                        {record.payee ? ` · ${record.payee}` : ''} · {formatDate(record.spent_at)}
                        {' · '}
                        {record.expense_number}
                        {' · '}
                        <Badge tone={record.payment_status === 'paid' ? 'healthy' : 'low'} size="sm">
                          {record.payment_status}
                        </Badge>
                      </span>
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      ₹{Number(record.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
