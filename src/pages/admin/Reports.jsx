import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useData } from '../../lib/data.jsx'
import { peso, monthKey, monthLabel, interestShare, addMonths, COUNTS_AS_LENT } from '../../lib/loanMath.js'
import { downloadXlsx } from '../../lib/exports.js'
import { Button, Card, PageHeader, Segmented } from '../../components/ui.jsx'

// Validated pair (dataviz validator: CVD ΔE 18.9 protan, normal 28.1). Gold has <3:1 contrast,
// so every chart has a legend and the monthly table below is the table view.
const GREEN = '#0F7A55'
const GOLD = '#D9A13A'
const RUST = '#B23B2E'
const AXIS = { fontSize: 11, fill: '#8F887C' }
const short = (v) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)

export default function Reports() {
  const { loans, today } = useData()
  const nav = useNavigate()
  const [range, setRange] = useState('12')

  const r = useMemo(() => {
    const lent = loans.filter((l) => COUNTS_AS_LENT.includes(l.status) && l.release_date)
    const first = lent.map((l) => monthKey(l.release_date)).sort()[0] || monthKey(today)
    const months = []
    for (let m = first; m <= monthKey(today); m = monthKey(addMonths(m + '-01', 1))) months.push(m)
    const rows = Object.fromEntries(months.map((m) => [m, { m, label: monthLabel(m), loans: 0, lent: 0, booked: 0, collected: 0, penalties: 0, newC: 0, returning: 0 }]))
    const firstLoan = {}
    lent.slice().sort((a, b) => (a.release_date < b.release_date ? -1 : 1)).forEach((l) => { firstLoan[l.client_id] ||= monthKey(l.release_date) })
    const seen = {}
    lent.forEach((l) => {
      const row = rows[monthKey(l.release_date)]
      if (!row) return
      row.loans++; row.lent += Number(l.principal); row.booked += Number(l.interest)
      const key = row.m + l.client_id
      if (!seen[key]) { seen[key] = 1; firstLoan[l.client_id] === row.m ? row.newC++ : row.returning++ }
    })
    loans.forEach((l) => l.payments.forEach((p) => {
      const row = rows[monthKey(p.paid_on)]
      if (!row) return
      row.collected += interestShare(l, p.amount); row.penalties += Number(p.penalty)
    }))
    const list = months.map((m) => ({ ...rows[m], collected: Math.round(rows[m].collected) }))

    const active = loans.filter((l) => l.status === 'active' && l.state.isOverdue)
    const buckets = [['1–15 days', 1, 15], ['16–30 days', 16, 30], ['31–60 days', 31, 60], ['60+ days', 61, 1e9]].map(([label, a, b]) => {
      const ls = active.filter((l) => l.state.daysOverdue >= a && l.state.daysOverdue <= b)
      return { label, amount: ls.reduce((s, l) => s + l.state.balance, 0), count: ls.length }
    })

    const byClient = {}
    lent.forEach((l) => {
      const c = (byClient[l.client_id] ||= { client: l.client, loans: 0, lent: 0, interest: 0, balance: 0, overdue: false })
      c.loans++; c.lent += Number(l.principal)
      if (l.status === 'paid') c.interest += Number(l.interest)
      if (l.status === 'active') { c.balance += l.state.balance; c.overdue ||= l.state.isOverdue }
    })
    const top = Object.values(byClient).sort((a, b) => b.interest - a.interest).slice(0, 10)
    return { list, buckets, top }
  }, [loans, today])

  const data = range === 'all' ? r.list : r.list.slice(-Number(range))
  const totals = data.reduce((t, x) => ({ loans: t.loans + x.loans, lent: t.lent + x.lent, booked: t.booked + x.booked, collected: t.collected + x.collected, penalties: t.penalties + x.penalties }), { loans: 0, lent: 0, booked: 0, collected: 0, penalties: 0 })

  const exportReport = () => downloadXlsx('Loan report.xlsx', [{
    name: 'Monthly',
    rows: r.list.map((x) => ({ Month: x.label, Loans: x.loans, 'Total lent': x.lent, 'Interest (booked)': x.booked, 'Interest collected': x.collected, Penalties: x.penalties, 'New clients': x.newC, 'Returning clients': x.returning })),
  }])

  return (
    <>
      <PageHeader title="Reports" actions={<>
        <Segmented value={range} onChange={setRange} options={[['6', '6 months'], ['12', '12 months'], ['all', 'All']]} />
        <Button size="sm" variant="secondary" onClick={exportReport}>Download</Button>
      </>} />

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCard title="Money lent per month" sub={`${peso(totals.lent)} in ${totals.loans} loans`}>
          <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E5DFD2" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#E5DFD2' }} tickFormatter={(v) => v.split(' ')[0]} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={52} />
            <Tooltip cursor={{ fill: '#F6F3EC' }} content={<Tip />} />
            <Bar dataKey="lent" name="Lent" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Interest: booked vs collected" sub={`booked ${peso(totals.booked)} · collected ${peso(totals.collected)}`}>
          <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#E5DFD2" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#E5DFD2' }} tickFormatter={(v) => v.split(' ')[0]} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={52} />
            <Tooltip cursor={{ fill: '#F6F3EC' }} content={<Tip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: '#57524A' }}>{v}</span>} />
            <Bar dataKey="booked" name="Booked (loans given)" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="collected" name="Collected (payments)" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Overdue by how late" sub={`${peso(r.buckets.reduce((s, b) => s + b.amount, 0))} unpaid past due`}>
          <BarChart data={r.buckets} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E5DFD2" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#E5DFD2' }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={52} />
            <Tooltip cursor={{ fill: '#F6F3EC' }} content={<Tip countKey="count" />} />
            <Bar dataKey="amount" name="Overdue balance" fill={RUST} radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ChartCard>

        <ChartCard title="New vs returning clients" sub="clients who borrowed each month">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#E5DFD2" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#E5DFD2' }} tickFormatter={(v) => v.split(' ')[0]} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: '#F6F3EC' }} content={<Tip plain />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: '#57524A' }}>{v}</span>} />
            <Bar dataKey="returning" name="Returning" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="newC" name="New" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ChartCard>
      </div>

      <Card className="mt-5">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Monthly summary</h2>
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead><tr><th>Month</th><th className="!text-right">Loans</th><th className="!text-right">Lent</th><th className="!text-right">Interest</th><th className="!text-right">Collected interest</th><th className="!text-right">Penalties</th><th className="!text-right">New clients</th></tr></thead>
            <tbody>
              {data.slice().reverse().map((x) => (
                <tr key={x.m} className="click" onClick={() => nav(`/admin/records?m=${x.m}`)}>
                  <td className="font-semibold">{x.label}</td>
                  <td className="text-right num">{x.loans}</td>
                  <td className="text-right num">{peso(x.lent)}</td>
                  <td className="text-right font-semibold text-moss num">{peso(x.booked)}</td>
                  <td className="text-right num">{peso(x.collected)}</td>
                  <td className="text-right num">{x.penalties ? peso(x.penalties) : '—'}</td>
                  <td className="text-right num">{x.newC}</td>
                </tr>
              ))}
              <tr className="bg-paper font-bold">
                <td>Total</td><td className="text-right num">{totals.loans}</td><td className="text-right num">{peso(totals.lent)}</td>
                <td className="text-right text-moss num">{peso(totals.booked)}</td><td className="text-right num">{peso(totals.collected)}</td>
                <td className="text-right num">{peso(totals.penalties)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-5">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Top clients by interest earned</h2>
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead><tr><th>#</th><th>Client</th><th className="!text-right">Loans</th><th className="!text-right">Total borrowed</th><th className="!text-right">Interest earned</th><th className="!text-right">Balance now</th></tr></thead>
            <tbody>
              {r.top.map((x, i) => (
                <tr key={x.client.id} className="click" onClick={() => nav(`/admin/clients/${x.client.id}`)}>
                  <td className="text-ink-faint">{i + 1}</td>
                  <td className="font-semibold">{x.client.full_name}</td>
                  <td className="text-right num">{x.loans}</td>
                  <td className="text-right num">{peso(x.lent)}</td>
                  <td className="text-right font-semibold text-moss num">{peso(x.interest)}</td>
                  <td className={`text-right num ${x.overdue ? 'text-rust font-semibold' : ''}`}>{x.balance ? peso(x.balance) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-ink-faint">Old sheet loans don't have real payment dates, so their "collected" interest is shown on the due date.</p>
    </>
  )
}

function ChartCard({ title, sub, children }) {
  return (
    <Card className="p-4">
      <div className="mb-3"><h2 className="font-semibold">{title}</h2>{sub && <div className="text-xs text-ink-soft">{sub}</div>}</div>
      <div className="h-60"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </Card>
  )
}

function Tip({ active, payload, label, plain, countKey }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-card">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-soft">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold num">{plain ? p.value : peso(p.value)}</span>
        </div>
      ))}
      {countKey && <div className="mt-0.5 text-ink-faint">{payload[0].payload[countKey]} loans</div>}
    </div>
  )
}
