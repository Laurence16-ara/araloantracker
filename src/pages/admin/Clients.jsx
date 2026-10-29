import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../lib/data.jsx'
import { peso, fmtDate } from '../../lib/loanMath.js'
import { Badge, Button, Card, Empty, PageHeader, Segmented } from '../../components/ui.jsx'
import { ClientModal } from '../../components/admin.jsx'

export default function Clients() {
  const { clients, loansByClient } = useData()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [add, setAdd] = useState(false)

  const rows = useMemo(() => clients.map((c) => {
    const ls = (loansByClient[c.id] || []).filter((l) => ['active', 'paid'].includes(l.status))
    const active = ls.filter((l) => l.status === 'active')
    return {
      c,
      count: ls.length,
      borrowed: ls.reduce((s, l) => s + Number(l.principal), 0),
      balance: active.reduce((s, l) => s + l.state.balance, 0),
      overdue: active.some((l) => l.state.isOverdue),
      last: ls.map((l) => l.release_date).sort().pop(),
    }
  }), [clients, loansByClient])

  const shown = rows
    .filter((r) => filter === 'all' || (filter === 'unpaid' && r.balance > 0) || (filter === 'overdue' && r.overdue) || (filter === 'blocked' && r.c.status === 'blocked'))
    .filter((r) => r.c.status !== 'rejected' || filter === 'all')
    .filter((r) => !q || `${r.c.full_name} ${r.c.aliases || ''} ${r.c.phone || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.last || '').localeCompare(a.last || '') || a.c.full_name.localeCompare(b.c.full_name))

  return (
    <>
      <PageHeader title="Clients" sub={`${clients.length} clients`} actions={<Button onClick={() => setAdd(true)}>+ Add client</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <input className="input max-w-xs !py-1.5" placeholder="Search name, other names, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Segmented value={filter} onChange={setFilter} options={[['all', 'All'], ['unpaid', 'Has balance'], ['overdue', 'Overdue'], ['blocked', 'Blocked']]} />
        </div>
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="tbl w-full">
              <thead><tr><th>Name</th><th>Mobile</th><th className="!text-right">Loans</th><th className="!text-right">Borrowed</th><th className="!text-right">Balance</th><th>Last loan</th></tr></thead>
              <tbody>
                {shown.map(({ c, count, borrowed, balance, overdue, last }) => (
                  <tr key={c.id} className="click" onClick={() => nav(`/admin/clients/${c.id}`)}>
                    <td className="font-semibold">
                      {c.full_name}{' '}
                      {c.status !== 'approved' && <Badge status={c.status} />}
                      {c.aliases && <div className="max-w-[260px] truncate text-[11px] font-normal text-ink-faint">aka {c.aliases}</div>}
                    </td>
                    <td className="text-ink-soft num">{c.phone || '—'}</td>
                    <td className="text-right num">{count}</td>
                    <td className="text-right num">{peso(borrowed)}</td>
                    <td className={`text-right font-semibold num ${overdue ? 'text-rust' : ''}`}>{balance ? peso(balance) : '—'}</td>
                    <td className="text-ink-soft num">{last ? fmtDate(last) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No clients found</Empty>}
      </Card>
      <ClientModal open={add} onClose={(id) => { setAdd(false); if (id) nav(`/admin/clients/${id}`) }} />
    </>
  )
}
