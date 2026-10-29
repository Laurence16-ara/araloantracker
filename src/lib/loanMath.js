// Pure loan calculations — no React, no Supabase. Tested in loanMath.test.js
// Dates are plain 'YYYY-MM-DD' strings in Philippine time.

export const SCHEDULES = {
  monthly: { label: 'Monthly', short: '1 payment', count: 1 },
  semi_monthly: { label: 'Every 15 days', short: '2 payments', count: 2 },
  weekly: { label: 'Weekly', short: '4 payments', count: 4 },
}

export function todayPH() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

const toUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10)

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * 86400000)
}

// Same day next month; clamps (Jan 31 → Feb 28), like Postgres.
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return fromUTC(target.getTime())
}

export function diffDays(a, b) {
  return Math.round((toUTC(a) - toUTC(b)) / 86400000)
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export function interestFor(principal, rate) {
  return round2((Number(principal) * Number(rate)) / 100)
}

// Installment plan. Every loan is 1 month; schedule only changes how it's split.
export function schedulePlan({ principal, interest, schedule, release_date }) {
  const total = round2(Number(principal) + Number(interest))
  if (!release_date) return []
  const end = addMonths(release_date, 1)
  let dues
  if (schedule === 'weekly') dues = [addDays(release_date, 7), addDays(release_date, 14), addDays(release_date, 21), end]
  else if (schedule === 'semi_monthly') dues = [addDays(release_date, 15), end]
  else dues = [end]
  const n = dues.length
  const each = Math.round(total / n) // whole pesos; last absorbs the remainder
  return dues.map((due, i) => ({
    n: i + 1,
    due,
    amount: i === n - 1 ? round2(total - each * (n - 1)) : each,
  }))
}

// Full state of a loan as of `today`.
// Payments go to the oldest unpaid installment first.
// Penalty = rate% per day × unpaid amount of a late installment, for each day late.
export function loanState(loan, payments = [], today = todayPH(), penaltyRate = 3) {
  const total = round2(Number(loan.principal) + Number(loan.interest))
  const plan = schedulePlan(loan)
  const pays = [...payments].sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : 0))
  const paid = round2(pays.reduce((s, p) => s + Number(p.amount || 0), 0))
  const penaltyPaid = round2(pays.reduce((s, p) => s + Number(p.penalty || 0), 0))
  const rate = Number(penaltyRate) / 100
  const closed = loan.status === 'paid'
  const stopDate = closed && loan.paid_at ? loan.paid_at : today

  // Track remaining per installment through time
  const inst = plan.map((p) => ({ ...p, paid: 0, remaining: p.amount, paidOn: null, penalty: 0, daysLate: 0 }))
  // events: [{date, amount}] — allocate each payment FIFO, recording when installments change
  const history = inst.map(() => []) // per installment: [{date, remainingAfter}]
  let idx = 0
  for (const p of pays) {
    let amt = Number(p.amount || 0)
    while (amt > 0.004 && idx < inst.length) {
      const it = inst[idx]
      const take = Math.min(amt, it.remaining)
      it.remaining = round2(it.remaining - take)
      it.paid = round2(it.paid + take)
      amt = round2(amt - take)
      history[idx].push({ date: p.paid_on, remaining: it.remaining })
      if (it.remaining <= 0.004) {
        it.paidOn = p.paid_on
        idx++
      }
    }
  }

  // Penalty per installment
  let penaltyAccrued = 0
  inst.forEach((it, i) => {
    let outstanding = it.amount
    let cursor = it.due
    let pen = 0
    const end = it.paidOn || stopDate
    for (const h of history[i]) {
      if (h.date > cursor) {
        const until = h.date < end ? h.date : end
        const days = Math.max(0, diffDays(until, cursor))
        pen += outstanding * rate * days
        cursor = until
      }
      outstanding = h.remaining
    }
    if (outstanding > 0.004 && end > cursor) pen += outstanding * rate * diffDays(end, cursor)
    it.penalty = round2(pen)
    it.daysLate = Math.max(0, diffDays(end, it.due))
    if (it.paidOn) it.daysLate = Math.max(0, diffDays(it.paidOn, it.due))
    penaltyAccrued += it.penalty
    if (closed && !it.paidOn) {
      it.remaining = 0
      it.status = 'paid'
    } else if (it.paidOn) it.status = it.daysLate > 0 ? 'paid_late' : 'paid'
    else if (today > it.due) it.status = 'overdue'
    else if (today === it.due) it.status = 'due_today'
    else it.status = it.paid > 0 ? 'partial' : 'upcoming'
  })
  penaltyAccrued = round2(penaltyAccrued)
  const waived = !!loan.penalty_waived
  const balance = closed ? 0 : round2(Math.max(0, total - paid))
  const overdueInst = inst.filter((i) => i.status === 'overdue')
  const overdueAmount = round2(overdueInst.reduce((s, i) => s + i.remaining, 0))
  const nextDue = inst.find((i) => i.status !== 'paid' && i.status !== 'paid_late') || null
  const dueDate = plan.length ? plan[plan.length - 1].due : null

  let display = loan.status
  if (loan.status === 'active') display = overdueInst.length ? 'overdue' : 'active'

  return {
    total,
    paid,
    balance,
    installments: inst,
    dueDate,
    nextDue,
    overdueAmount,
    daysOverdue: overdueInst.length ? diffDays(today, overdueInst[0].due) : 0,
    isOverdue: display === 'overdue',
    penaltyAccrued: waived ? 0 : penaltyAccrued,
    penaltyPaid,
    penaltyBalance: waived || closed ? 0 : round2(Math.max(0, penaltyAccrued - penaltyPaid)),
    display,
  }
}

// Share of a payment that counts as interest (proportional)
export function interestShare(loan, amount) {
  const total = Number(loan.principal) + Number(loan.interest)
  if (!total) return 0
  return round2((Number(amount) * Number(loan.interest)) / total)
}

export const COUNTS_AS_LENT = ['active', 'paid']

export function peso(n, { decimals = false } = {}) {
  const v = Number(n || 0)
  return '₱' + v.toLocaleString('en-PH', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : Number.isInteger(round2(v)) ? 0 : 2,
  })
}

export function fmtDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return '—'
  const d = new Date(toUTC(iso.slice(0, 10)))
  return d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}

export function monthKey(iso) {
  return iso ? iso.slice(0, 7) : null
}

export function monthLabel(key, long = false) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function scheduleText(loan) {
  const plan = schedulePlan(loan)
  if (!plan.length) {
    const total = Number(loan.principal) + Number(loan.interest)
    const n = SCHEDULES[loan.schedule]?.count || 1
    return n === 1 ? `one payment of ${peso(total)}` : `${n} payments of about ${peso(total / n)}`
  }
  if (plan.length === 1) return `one payment of ${peso(plan[0].amount)} on ${fmtDate(plan[0].due)}`
  return plan.map((p) => `${peso(p.amount)} on ${fmtDate(p.due)}`).join(', ')
}
