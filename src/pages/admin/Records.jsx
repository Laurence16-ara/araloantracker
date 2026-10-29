import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../../lib/data.jsx'
import { peso, monthKey, monthLabel, COUNTS_AS_LENT } from '../../lib/loanMath.js'
import { exportMonth, exportBackup } from '../../lib/exports.js'
import { Button, Card, PageHeader, Segmented } from '../../components/ui.jsx'
import { LoanTable } from '../../components/admin.jsx'
import { cx } from '../../lib/utils.js'

export default function Records() {
  const data = useData()
  const { loans, today } = data
  const [params, setParams] = useSearchParams()
  const months = useMemo(() => {
    const set = new Set(loans.filter((l) => l.release_date).map((l) => monthKey(l.release_date)))
    set.add(monthKey(today))
    return [...set].sort().reverse()
  }, [loans, today])
  const month = params.get('m') || months[0]
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')

  const inMonth = loans.filter((l) => COUNTS_AS_LENT.includes(l.status) && monthKey(l.release_date) === month)
  const shown = inMonth
    .filter((l) => filter === 'all' || (filter === 'unpaid' && l.status === 'active') || (filter === 'overdue' && l.state.isOverdue) || (filter === 'paid' && l.status === 'paid'))
    .filter((l) => !q || `${l.client?.full_name} ${l.client?.aliases || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.release_date < b.release_date ? -1 : a.release_date > b.release_date ? 1 : a.loan_no - b.loan_no))

  const sum = (arr, f) => arr.reduce((s, l) => s + f(l), 0)
  return (
    <>
      <PageHeader title="Records" sub="Like your Google Sheet: one tab per month"
        actions={<>
          <Button variant="secondary" size="sm" onClick={() => exportMonth(monthLabel(month), shown)}>Download this month</Button>
          <Button variant="secondary" size="sm" onClick={() => exportBackup(data)}>Download all</Button>
        </>} />

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1.5">
          {months.map((m) => (
            <button key={m} onClick={() => setParams({ m })}
              className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold', m === month ? 'bg-ink text-paper' : 'bg-card text-ink-soft border border-line hover:text-ink')}>
              {monthLabel(m).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Box label="Total lent" value={peso(sum(inMonth, (l) => Number(l.principal)))} />
        <Box label="Interest" value={peso(sum(inMonth, (l) => Number(l.interest)))} tone="text-moss" />
        <Box label="Loans" value={`${inMonth.length}  ·  ${inMonth.filter((l) => l.status === 'paid').length} paid`} />
        <Box label="Still unpaid" value={peso(sum(inMonth, (l) => (l.status === 'active' ? l.state.balance : 0)))} tone={inMonth.some((l) => l.state.isOverdue) ? 'text-rust' : ''} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <Segmented value={filter} onChange={setFilter} options={[['all', 'All'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid']]} />
          <input className="input max-w-xs !py-1.5" placeholder="Search name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <LoanTable loans={shown} empty="No loans this month" />
      </Card>
    </>
  )
}

function Box({ label, value, tone = '' }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cx('mt-0.5 text-lg font-bold num', tone)}>{value}</div>
    </div>
  )
}
