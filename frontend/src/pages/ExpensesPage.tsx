import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useBusinessUnit } from '@/hooks/useBusinessUnit'
import {
  createExpense,
  listExpenses,
} from '@/services/expenses'
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  formatCategory,
} from '@/types/expense'
import type { Expense, ExpenseCategory, PaymentMethod } from '@/types/expense'

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
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [description, setDescription] = useState('')
  const [payee, setPayee] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, setPending] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const amountRef = useRef<HTMLInputElement>(null)
  const formCardRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    void load()
  }, [load])

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
        description: description.trim(),
        payee: payee.trim() || null,
        date,
        idempotency_key: crypto.randomUUID(),
      })
      setSuccessMsg(
        `Expense ${record.expense_number} recorded — ₹${Number(record.amount).toFixed(2)} for ${formatCategory(record.category)}.`,
      )
      setAmount('')
      setDescription('')
      setPayee('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the expense.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
        <p className="mt-1 text-sm text-slate-500">
          Where the money went — outside of stock purchases.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
        <div ref={formCardRef} className="scroll-mt-4">
        <Card title="Record expense">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Input
              label="Amount (₹)"
              ref={amountRef}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
            <Select label="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Electricity bill for August"
              maxLength={300}
              required
            />
            <Input
              label="Paid to (optional)"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              maxLength={120}
            />
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button type="submit" pending={pending} className="w-full">
              Record expense
            </Button>
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
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
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
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <Select label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
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
                        {formatCategory(record.category)}
                        {record.payee ? ` · ${record.payee}` : ''} · {formatDate(record.spent_at)}
                        {' · '}
                        {record.expense_number}
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
