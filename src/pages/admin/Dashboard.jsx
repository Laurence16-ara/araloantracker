import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../../lib/data.jsx'
import { peso, fmtDate, diffDays, monthKey, monthLabel, interestShare, COUNTS_AS_LENT } from '../../lib/loanMath.js'
import { Badge, Button, Card, Empty, PageHeader, Stat } from '../../components/ui.jsx'
import { NewLoanModal } from '../../components/admin.jsx'

export default function Dashboard() {
  const { loans, today } = useData()
  const [newLoan, setNewLoan] = useState(false)
  const nav = useNavigate()

  const d = useMemo(() => {
    const month = monthKey(today)
    const active = loans.filter((l) => l.status === 'active')
    const overdue = active.filter((l) => l.state.isOverdue).sort((a, b) => b.state.daysOverdue - a.state.daysOverdue)
    const dueSoon = []
    active.forEach((l) =>
      l.state.installments.forEach((i) => {
        const days = diffDays(i.due, today)
        if (['upcoming', 'partial', 'due_today'].includes(i.status) && days >= 0 && days <= 7) dueSoon.push({ loan: l, inst: i, days })
      }),
    )
    dueSoon.sort((a, b) => a.days - b.days)
    const thisMonth = loans.filter((l) => COUNTS_AS_LENT.includes(l.status) && monthKey(l.release_date) === month)
    let collected = 0, collectedInterest = 0, penalties = 0
    loans.forEach((l) => l.payments.forEach((p) => {
      if (monthKey(p.paid_on) !== month) return
      collected += Number(p.amount); collectedInterest += interestShare(l, p.amount); penalties += Number(p.penalty)
    }))
    return {
      month,
      outstanding: active.reduce((s, l) => s + l.state.balance, 0),
      activeCount: active.length,
      overdue,
      overdueAmt: overdue.reduce((s, l) => s + l.state.overdueAmount, 0),
      dueSoon,
      dueWeekAmt: dueSoon.reduce((s, x) => s + x.inst.remaining, 0),
      lent: thisMonth.reduce((s, l) => s + Number(l.principal), 0),
      booked: thisMonth.reduce((s, l) => s + Number(l.interest), 0),
      lentCount: thisMonth.length,
      collected, collectedInterest, penalties,
      toRelease: loans.filter((l) => l.status === 'for_release').length,
      awaiting: loans.filter((l) => l.status === 'awaiting_signature').length,
    }
  }, [loans, today])

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub={fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        actions={<Button onClick={() => setNewLoan(true)}>+ New loan</Button>}
      />

      {(d.toRelease > 0 || d.awaiting > 0) && (
        <Link to="/admin/applications" className="mb-4 flex items-center justify-between rounded-xl border border-amber/30 bg-amber-light px-4 py-3 text-sm">
          <span>
            {d.toRelease > 0 && <b>{d.toRelease} signed loan{d.toRelease > 1 ? 's' : ''} waiting for release</b>}
            {d.toRelease > 0 && d.awaiting > 0 && ' · '}
            {d.awaiting > 0 && <span>{d.awaiting} waiting for client signature</span>}
          </span>
          <span className="font-semibold text-amber">Review →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Money out now" value={peso(d.outstanding)} sub={`${d.activeCount} unpaid loans`} />
        <Stat label="Overdue" value={peso(d.overdueAmt)} sub={`${d.overdue.length} loans`} tone={d.overdue.length ? 'rust' : undefined} />
        <Stat label="Due in 7 days" value={peso(d.dueWeekAmt)} sub={`${d.dueSoon.length} payments`} tone="amber" />
        <Stat label={`Interest · ${monthLabel(d.month)}`} value={peso(d.booked)} sub={`collected ${peso(d.collectedInterest)}`} tone="moss" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <MiniStat label="Lent this month" value={peso(d.lent)} sub={`${d.lentCount} loans`} />
        <MiniStat label="Collected this month" value={peso(d.collected)} />
        <MiniStat label="Penalties collected" value={peso(d.penalties)} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Due in the next 7 days</h2>
          </div>
          {d.dueSoon.length ? (
            <ul>
              {d.dueSoon.map(({ loan, inst, days }) => (
                <li key={loan.id + inst.n} onClick={() => nav(`/admin/loans/${loan.id}`)} className="flex cursor-pointer items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-paper">
                  <div>
                    <div className="text-sm font-semibold">{loan.client?.full_name}</div>
                    <div className="text-xs text-ink-faint">
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : fmtDate(inst.due, { weekday: 'short', month: 'short', day: 'numeric' })}
                      {loan.state.installments.length > 1 && ` · payment ${inst.n} of ${loan.state.installments.length}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold num">{peso(inst.remaining)}</div>
                    {days === 0 && <Badge status="due_today" />}
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing due this week</Empty>}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Overdue</h2>
            <span className="text-xs text-ink-faint">oldest first</span>
          </div>
          {d.overdue.length ? (
            <ul>
              {d.overdue.map((l) => (
                <li key={l.id} onClick={() => nav(`/admin/loans/${l.id}`)} className="flex cursor-pointer items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-paper">
                  <div>
                    <div className="text-sm font-semibold">{l.client?.full_name}</div>
                    <div className="text-xs text-ink-faint">Released {fmtDate(l.release_date)} · {l.state.daysOverdue} days late</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-rust num">{peso(l.state.balance)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>No overdue loans 🎉</Empty>}
        </Card>
      </div>

      <NewLoanModal open={newLoan} onClose={() => setNewLoan(false)} />
    </>
  )
}

function MiniStat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-line bg-card/60 px-2 py-3">
      <div className="text-[11px] font-semibold text-ink-faint">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold num">{value}</div>
      {sub && <div className="text-[11px] text-ink-faint">{sub}</div>}
    </div>
  )
}
