// Household money: income (rental, parking, GCash Business fees, other) and expenses.
// Kept separate from the loan tracker on purpose: own page, own tables, same sign-in.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase.js'
import { AdminGate, FullSpinner } from '../components/AdminLayout.jsx'
import { Button, Card, Empty, ErrorNote, Field, Modal, Segmented } from '../components/ui.jsx'
import { peso, fmtDate, round2, todayPH } from '../lib/loanMath.js'
import { DEFAULT_TIERS, currentMonth, gcashFee, monthEnd, monthName, monthOf, monthsBetween, shiftMonth } from '../lib/money.js'
import { cx } from '../lib/utils.js'

const TREND_MONTHS = 6
const money = (n) => peso(n, { decimals: !Number.isInteger(round2(Number(n) || 0)) })

export default function Money() {
  return <AdminGate>{(email) => <MoneyApp email={email} />}</AdminGate>
}

// ---------------------------------------------------------------- data
async function fetchEntries(from, to) {
  const size = 1000
  let all = []
  for (let start = 0; ; start += size) {
    const { data, error } = await supabase.from('money_entries').select('*')
      .gte('entry_date', from).lte('entry_date', to)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false })
      .range(start, start + size - 1)
    if (error) throw error
    all = all.concat(data)
    if (data.length < size) return all
  }
}

// Adds this month's (and any missed month's) rental / parking entries. The unique key stops duplicates.
async function addRecurringEntries(recurring) {
  const now = currentMonth()
  const rows = []
  for (const r of recurring.filter((x) => x.active)) {
    const from = r.start_month < shiftMonth(now, -12) ? shiftMonth(now, -12) : r.start_month
    for (const m of monthsBetween(from, now)) {
      rows.push({ kind: r.kind || 'income', category: r.category, amount: r.amount, entry_date: `${m}-${String(r.day_of_month).padStart(2, '0')}`, note: r.name, recurring_id: r.id, month_key: m })
    }
  }
  if (!rows.length) return
  const { error } = await supabase.from('money_entries').upsert(rows, { onConflict: 'recurring_id,month_key', ignoreDuplicates: true })
  if (error) throw error
}

function MoneyApp({ email }) {
  const [month, setMonth] = useState(currentMonth())
  const [config, setConfig] = useState(null)
  const [recurring, setRecurring] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [settings, setSettings] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async (m, { addRecurring = false } = {}) => {
    try {
      const [cfg, rec] = await Promise.all([
        supabase.from('money_config').select('*').eq('id', 1).single(),
        supabase.from('money_recurring').select('*').order('created_at', { ascending: true }),
      ])
      if (cfg.error) throw cfg.error
      if (rec.error) throw rec.error
      if (addRecurring) await addRecurringEntries(rec.data)
      const list = await fetchEntries(`${shiftMonth(m, -(TREND_MONTHS - 1))}-01`, monthEnd(m))
      setConfig(cfg.data); setRecurring(rec.data); setEntries(list); setError(null)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(month, { addRecurring: true }) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) load(month) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps
  const reload = () => load(month)

  useEffect(() => { document.title = 'Ara Money' }, [])

  const inMonth = useMemo(() => entries.filter((e) => monthOf(e.entry_date) === month), [entries, month])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber font-serif text-base font-semibold text-paper">₱</div>
            <div className="leading-tight">
              <div className="text-sm font-bold">Ara Money</div>
              <div className="text-[11px] text-ink-faint">Income & expenses</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a href="/admin" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-ink">Loans</a>
            <button onClick={() => setSettings(true)} className="rounded-lg px-2 py-1 text-lg text-ink-soft hover:text-ink" aria-label="Money settings">⚙</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-5">
        {error && <div className="mb-4"><ErrorNote>Couldn't load: {error} <button className="ml-2 underline" onClick={reload}>Retry</button></ErrorNote></div>}
        {loading || !config ? <FullSpinner inline /> : (
          <>
            <MonthPicker month={month} onChange={setMonth} />
            <Summary entries={inMonth} />
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr] [&>*]:min-w-0">
              <div className="space-y-5">
                <QuickAdd config={config} entries={entries} onSaved={reload} />
                <Breakdown entries={inMonth} />
              </div>
              <div className="space-y-5">
                <Entries entries={inMonth} onEdit={setEditing} />
                <Trend entries={entries} month={month} />
              </div>
            </div>
            <p className="mt-8 text-center text-xs text-ink-faint">Signed in as {email} · <button className="underline" onClick={() => supabase.auth.signOut()}>Sign out</button></p>
          </>
        )}
      </main>

      {config && <EntryModal entry={editing} config={config} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {config && <SettingsModal open={settings} onClose={() => setSettings(false)} config={config} recurring={recurring} onSaved={() => load(month, { addRecurring: true })} />}
    </div>
  )
}

// ---------------------------------------------------------------- pieces
function MonthPicker({ month, onChange }) {
  const now = currentMonth()
  const btn = 'flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-card text-ink-soft hover:text-ink disabled:opacity-40'
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <button className={btn} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
      <div className="text-center">
        <h1 className="font-serif text-2xl font-semibold">{monthName(month)}</h1>
        {month !== now && <button className="text-xs font-semibold text-moss underline" onClick={() => onChange(now)}>Back to this month</button>}
      </div>
      <button className={btn} onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= now} aria-label="Next month">›</button>
    </div>
  )
}

const sum = (list) => round2(list.reduce((s, e) => s + Number(e.amount || 0), 0))

function Summary({ entries }) {
  const income = sum(entries.filter((e) => e.kind === 'income'))
  const expense = sum(entries.filter((e) => e.kind === 'expense'))
  const gcash = entries.filter((e) => e.kind === 'income' && e.gcash_amount != null)
  const left = round2(income - expense)
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Tile label="Income" value={money(income)} sub={gcash.length ? `GCash ${money(sum(gcash))}` : ''} tone="text-moss" />
      <Tile label="Expenses" value={money(expense)} tone="text-rust" />
      <Tile label="Left" value={money(left)} tone={left < 0 ? 'text-rust' : 'text-ink'} />
    </div>
  )
}

function Tile({ label, value, sub, tone }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cx('mt-0.5 font-serif text-lg font-semibold num sm:text-2xl', tone)}>{value}</div>
      {sub && <div className="truncate text-[11px] text-ink-faint">{sub}</div>}
    </Card>
  )
}

function Chips({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={cx('rounded-full border px-3 py-1.5 text-[13px] font-semibold', value === o ? 'border-moss bg-moss text-white' : 'border-line bg-card text-ink-soft hover:text-ink')}>
          {o}
        </button>
      ))}
    </div>
  )
}

const numOnly = (v) => v.replace(/[^\d.]/g, '')

function QuickAdd({ config, entries, onSaved }) {
  const [tab, setTab] = useState('gcash')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('')
  const [feeEdited, setFeeEdited] = useState(false)
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(todayPH())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)

  const autoFee = gcashFee(amount, config.gcash_tiers)
  const shownFee = feeEdited ? fee : (amount ? String(autoFee) : '')
  const incomeCats = (config.income_categories || []).filter((c) => c !== 'GCash')
  const cats = tab === 'expense' ? config.expense_categories : incomeCats

  function switchTab(t) { setTab(t); setCategory(''); setErr(null) }

  async function save(e) {
    e.preventDefault()
    setErr(null)
    const a = Number(amount)
    if (!(a > 0)) return setErr('Enter the amount.')
    if (tab !== 'gcash' && !category) return setErr('Choose a category.')
    const row = tab === 'gcash'
      ? { kind: 'income', category: 'GCash', gcash_amount: a, amount: Number(shownFee) || 0, entry_date: date, note: note.trim() || null }
      : { kind: tab, category, amount: a, entry_date: date, note: note.trim() || null }
    setBusy(true)
    const { error } = await supabase.from('money_entries').insert(row)
    setBusy(false)
    if (error) return setErr(error.message)
    setDone(tab === 'gcash' ? `Added ${money(row.amount)} fee` : `Added ${money(a)} ${category}`)
    setTimeout(() => setDone(null), 2500)
    setAmount(''); setFee(''); setFeeEdited(false); setNote('')
    onSaved()
  }

  const todayG = entries.filter((x) => x.entry_date === todayPH() && x.gcash_amount != null)

  return (
    <Card className="p-4">
      <Segmented value={tab} onChange={switchTab} options={[['gcash', 'GCash'], ['expense', 'Expense'], ['income', 'Income']]} />
      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={tab === 'gcash' ? 'Cash-in / out amount' : 'Amount'} className={tab === 'gcash' ? '' : 'col-span-2'}>
            <input className="input text-lg font-semibold num" inputMode="decimal" placeholder="₱" value={amount} onChange={(e) => setAmount(numOnly(e.target.value))} />
          </Field>
          {tab === 'gcash' && (
            <Field label="Fee" hint={feeEdited ? <button type="button" className="underline" onClick={() => { setFeeEdited(false); setFee('') }}>Use auto fee ({money(autoFee)})</button> : 'Auto from fee table'}>
              <input className="input text-lg font-semibold num" inputMode="decimal" placeholder="₱" value={shownFee} onChange={(e) => { setFeeEdited(true); setFee(numOnly(e.target.value)) }} />
            </Field>
          )}
        </div>
        {tab !== 'gcash' && <div><span className="label">Category</span><Chips value={category} onChange={setCategory} options={cats} /></div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input className="input" type="date" value={date} max={todayPH()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tab === 'gcash' ? 'e.g. cash-in' : ''} /></Field>
        </div>
        <ErrorNote>{err}</ErrorNote>
        <Button className="w-full" size="lg" loading={busy}>{done || (tab === 'gcash' ? `Add GCash${shownFee ? ` · ${money(Number(shownFee))} fee` : ''}` : tab === 'expense' ? 'Add expense' : 'Add income')}</Button>
      </form>
      {tab === 'gcash' && (
        <div className="mt-3 flex justify-between rounded-lg bg-paper px-3 py-2 text-sm">
          <span className="text-ink-soft">Today: {todayG.length} transaction{todayG.length === 1 ? '' : 's'} · {money(todayG.reduce((s, x) => s + Number(x.gcash_amount), 0))}</span>
          <b className="num text-moss">{money(sum(todayG))} fees</b>
        </div>
      )}
    </Card>
  )
}

function Breakdown({ entries }) {
  const group = (kind) => {
    const m = {}
    entries.filter((e) => e.kind === kind).forEach((e) => { m[e.category] = round2((m[e.category] || 0) + Number(e.amount)) })
    return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }
  const exp = group('expense')
  const inc = group('income')
  if (!exp.length && !inc.length) return null
  return (
    <Card className="p-4">
      <BarList title="Where the money went" rows={exp} color="bg-rust" />
      {exp.length > 0 && inc.length > 0 && <div className="my-4 border-t border-line" />}
      <BarList title="Where the money came from" rows={inc} color="bg-moss" />
    </Card>
  )
}

function BarList({ title, rows, color }) {
  if (!rows.length) return null
  const max = rows[0][1]
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-sm"><span>{k}</span><span className="font-semibold num">{money(v)}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-paper"><div className={cx('h-1.5 rounded-full', color)} style={{ width: `${Math.max(2, (v / max) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

const FILTERS = [['all', 'All'], ['income', 'Income'], ['expense', 'Expenses'], ['gcash', 'GCash']]

function Entries({ entries, onEdit }) {
  const [filter, setFilter] = useState('all')
  const shown = entries.filter((e) => filter === 'all' || (filter === 'gcash' ? e.gcash_amount != null : e.kind === filter))
  const days = []
  shown.forEach((e) => {
    const last = days[days.length - 1]
    if (last && last.date === e.entry_date) last.items.push(e)
    else days.push({ date: e.entry_date, items: [e] })
  })
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="font-semibold">Entries</h2>
        <Segmented value={filter} onChange={setFilter} options={FILTERS} />
      </div>
      {days.length ? days.map((d) => {
        const net = round2(d.items.reduce((s, e) => s + (e.kind === 'income' ? 1 : -1) * Number(e.amount), 0))
        return (
          <div key={d.date}>
            <div className="flex justify-between bg-paper px-4 py-1.5 text-xs font-semibold text-ink-faint">
              <span>{fmtDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span className="num">{net >= 0 ? '+' : '−'}{money(Math.abs(net))}</span>
            </div>
            {d.items.map((e) => (
              <button key={e.id} onClick={() => onEdit(e)} className="flex w-full items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-left first:border-t-0 hover:bg-paper">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{e.category}{e.recurring_id && Number(e.amount) === 0 && <span className="ml-1.5 text-xs font-normal text-ink-faint">{e.kind === 'expense' ? 'skipped' : 'not received'}</span>}</div>
                  <div className="truncate text-xs text-ink-faint">
                    {e.gcash_amount != null ? `${money(e.gcash_amount)} cash-in/out${e.note ? ` · ${e.note}` : ''}` : e.note || (e.kind === 'income' ? 'Income' : 'Expense')}
                  </div>
                </div>
                <div className={cx('shrink-0 font-semibold num', e.kind === 'income' ? 'text-moss' : 'text-rust')}>{e.kind === 'income' ? '+' : '−'}{money(e.amount)}</div>
              </button>
            ))}
          </div>
        )
      }) : <Empty>Nothing yet this month</Empty>}
    </Card>
  )
}

function Trend({ entries, month }) {
  const months = monthsBetween(shiftMonth(month, -(TREND_MONTHS - 1)), month)
  const data = months.map((m) => {
    const list = entries.filter((e) => monthOf(e.entry_date) === m)
    return { m: monthName(m, false).split(' ')[0], Income: sum(list.filter((e) => e.kind === 'income')), Expenses: sum(list.filter((e) => e.kind === 'expense')) }
  })
  if (!data.some((d) => d.Income || d.Expenses)) return null
  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Last {TREND_MONTHS} months</h2>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -10, right: 4 }}>
            <CartesianGrid vertical={false} stroke="#E5DFD2" />
            <XAxis dataKey="m" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
            <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#F6F3EC' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Income" fill="#1F5C46" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expenses" fill="#B23B2E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- edit one entry
function EntryModal({ entry, config, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!entry) return
    setF({ amount: String(Number(entry.amount)), gcash_amount: entry.gcash_amount != null ? String(Number(entry.gcash_amount)) : '', category: entry.category, entry_date: entry.entry_date, note: entry.note || '' })
    setErr(null)
  }, [entry])
  if (!entry) return null
  const isGcash = entry.gcash_amount != null
  const isRecurring = Boolean(entry.recurring_id)
  const cats = entry.kind === 'expense' ? config.expense_categories : config.income_categories
  const options = cats.includes(f.category) ? cats : [...cats, f.category]

  async function save() {
    setErr(null)
    if (!(Number(f.amount) >= 0) || f.amount === '') return setErr('Enter the amount.')
    const patch = { amount: Number(f.amount), entry_date: f.entry_date, note: f.note.trim() || null }
    if (isGcash) patch.gcash_amount = Number(f.gcash_amount) || 0
    else patch.category = f.category
    setBusy('save')
    const { error } = await supabase.from('money_entries').update(patch).eq('id', entry.id)
    setBusy(null)
    if (error) return setErr(error.message)
    onSaved()
  }
  async function remove() {
    if (!confirm('Delete this entry?')) return
    setBusy('delete')
    const { error } = await supabase.from('money_entries').delete().eq('id', entry.id)
    setBusy(null)
    if (error) return setErr(error.message)
    onSaved()
  }
  async function notReceived() {
    setBusy('skip')
    const { error } = await supabase.from('money_entries').update({ amount: 0 }).eq('id', entry.id)
    setBusy(null)
    if (error) return setErr(error.message)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${isGcash ? 'GCash' : entry.kind}`}>
      <div className="space-y-3">
        {isRecurring && <p className="rounded-lg bg-paper px-3 py-2 text-sm text-ink-soft">{entry.note} is added every month. Change this month's amount here (e.g. if the bill was different), or {entry.kind === 'expense' ? 'skip it for this month' : 'mark it as not received'}.</p>}
        <div className="grid grid-cols-2 gap-3">
          {isGcash && (
            <Field label="Cash-in / out amount" hint={<button type="button" className="underline" onClick={() => setF({ ...f, amount: String(gcashFee(f.gcash_amount, config.gcash_tiers)) })}>Set fee from table</button>}>
              <input className="input num" inputMode="decimal" value={f.gcash_amount} onChange={(e) => setF({ ...f, gcash_amount: numOnly(e.target.value) })} />
            </Field>
          )}
          <Field label={isGcash ? 'Fee' : 'Amount'} className={isGcash ? '' : 'col-span-2'}>
            <input className="input font-semibold num" inputMode="decimal" value={f.amount ?? ''} onChange={(e) => setF({ ...f, amount: numOnly(e.target.value) })} />
          </Field>
        </div>
        {!isGcash && <div><span className="label">Category</span><Chips value={f.category} onChange={(v) => setF({ ...f, category: v })} options={options.filter((c) => entry.kind === 'expense' || c !== 'GCash')} /></div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input className="input" type="date" value={f.entry_date || ''} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></Field>
          <Field label="Note"><input className="input" value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {isRecurring
            ? <Button variant="danger" onClick={notReceived} loading={busy === 'skip'} disabled={Number(entry.amount) === 0}>{entry.kind === 'expense' ? 'Skip this month' : 'Not received'}</Button>
            : <Button variant="danger" onClick={remove} loading={busy === 'delete'}>Delete</Button>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={busy === 'save'}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- settings
function SettingsModal({ open, onClose, config, recurring, onSaved }) {
  const [tiers, setTiers] = useState([])
  const [expCats, setExpCats] = useState([])
  const [incCats, setIncCats] = useState([])
  const [rec, setRec] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!open) return
    setTiers((config.gcash_tiers?.length ? config.gcash_tiers : DEFAULT_TIERS).map((t) => ({ max: String(t.max), fee: String(t.fee) })))
    setExpCats(config.expense_categories || [])
    setIncCats(config.income_categories || [])
    setRec(recurring.map((r) => ({ ...r, amount: String(Number(r.amount)), day_of_month: String(r.day_of_month) })))
    setErr(null)
  }, [open, config, recurring])

  const cleanTiers = tiers.map((t) => ({ max: Number(t.max), fee: Number(t.fee) })).filter((t) => t.max > 0).sort((a, b) => a.max - b.max)
  const examples = [100, 300, 500, 1000, 1500, 2000]

  async function save() {
    setErr(null)
    if (!cleanTiers.length) return setErr('Add at least one fee row.')
    if (rec.some((r) => !r.name.trim() || !(Number(r.amount) >= 0) || !(Number(r.day_of_month) >= 1 && Number(r.day_of_month) <= 28))) return setErr('Each monthly item needs a name, an amount, and a day from 1 to 28.')
    setBusy(true)
    try {
      const { error } = await supabase.from('money_config').update({
        gcash_tiers: cleanTiers, expense_categories: expCats, income_categories: incCats.includes('GCash') ? incCats : [...incCats, 'GCash'], updated_at: new Date().toISOString(),
      }).eq('id', 1)
      if (error) throw error
      for (const r of rec) {
        const row = { kind: r.kind || 'income', name: r.name.trim(), category: r.category, amount: Number(r.amount), day_of_month: Number(r.day_of_month), active: r.active }
        const res = r.id ? await supabase.from('money_recurring').update(row).eq('id', r.id) : await supabase.from('money_recurring').insert(row)
        if (res.error) throw res.error
      }
      onSaved(); onClose()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Money settings" wide>
      <div className="space-y-6">
        <section>
          <h3 className="font-semibold">GCash Business fee</h3>
          <p className="mb-2 text-xs text-ink-faint">Amounts above the last row are split into chunks of it, e.g. ₱1,500 = ₱1,000 + ₱500.</p>
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-ink-soft">{i === 0 ? 'Up to ₱' : `${Number(tiers[i - 1].max) + 1 || ''} to ₱`}</span>
                <input className="input w-24 num" inputMode="decimal" value={t.max} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, max: numOnly(e.target.value) } : x)))} />
                <span className="whitespace-nowrap text-ink-soft">fee ₱</span>
                <input className="input w-20 num" inputMode="decimal" value={t.fee} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, fee: numOnly(e.target.value) } : x)))} />
                <button type="button" className="text-xs text-ink-faint hover:text-rust" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 text-sm font-semibold text-moss" onClick={() => setTiers([...tiers, { max: '', fee: '' }])}>+ Add row</button>
          {cleanTiers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
              {examples.map((a) => <span key={a} className="num">{money(a)} → <b className="text-ink">{money(gcashFee(a, cleanTiers))}</b></span>)}
            </div>
          )}
        </section>

        <RecurringEditor kind="income" title="Monthly income" rec={rec} setRec={setRec} cats={incCats.filter((c) => c !== 'GCash')} />
        <RecurringEditor kind="expense" title="Monthly bills" rec={rec} setRec={setRec} cats={expCats} />

        <CategoryEditor title="Expense categories" list={expCats} onChange={setExpCats} />
        <CategoryEditor title="Income categories" list={incCats.filter((c) => c !== 'GCash')} onChange={(l) => setIncCats([...l, 'GCash'])} />

        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save settings</Button>
        </div>
      </div>
    </Modal>
  )
}

// Monthly income (rental, parking) or monthly bills (wifi): added automatically every month.
function RecurringEditor({ kind, title, rec, setRec, cats }) {
  const mine = rec.map((r, i) => [r, i]).filter(([r]) => (r.kind || 'income') === kind)
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-ink-faint">Added automatically every month on the day you set. Turn one off to stop adding it.</p>
      <div className="space-y-2">
        {mine.map(([r, i]) => {
          const set = (k, v) => setRec(rec.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
          return (
            <div key={r.id || `new-${i}`} className={cx('grid grid-cols-[1fr_96px] gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1fr_110px_96px_70px_auto] sm:items-end', !r.active && 'opacity-60')}>
              <Field label="Name"><input className="input" value={r.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Amount"><input className="input num" inputMode="decimal" value={r.amount} onChange={(e) => set('amount', numOnly(e.target.value))} /></Field>
              <Field label="Category">
                <select className="input" value={r.category} onChange={(e) => set('category', e.target.value)}>
                  {[...new Set([...cats, r.category])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Day"><input className="input num" inputMode="numeric" value={r.day_of_month} onChange={(e) => set('day_of_month', e.target.value.replace(/\D/g, ''))} /></Field>
              <label className="col-span-2 flex items-center gap-2 pb-2 text-sm sm:col-span-1"><input type="checkbox" className="h-4 w-4 accent-moss" checked={r.active} onChange={(e) => set('active', e.target.checked)} />On</label>
            </div>
          )
        })}
      </div>
      <button type="button" className="mt-2 text-sm font-semibold text-moss" onClick={() => setRec([...rec, { kind, name: '', category: cats[0] || 'Other', amount: '', day_of_month: '1', active: true }])}>+ Add {kind === 'expense' ? 'monthly bill' : 'monthly income'}</button>
    </section>
  )
}

function CategoryEditor({ title, list, onChange }) {
  const [add, setAdd] = useState('')
  const addOne = () => {
    const v = add.trim().slice(0, 40)
    if (v && !list.some((c) => c.toLowerCase() === v.toLowerCase())) onChange([...list, v])
    setAdd('')
  }
  return (
    <section>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full border border-line bg-card py-1 pl-3 pr-1.5 text-[13px] font-semibold">
            {c}<button type="button" className="rounded-full px-1 text-ink-faint hover:text-rust" onClick={() => onChange(list.filter((x) => x !== c))} aria-label={`Remove ${c}`}>✕</button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="input max-w-[220px]" placeholder="New category" value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOne() } }} />
        <Button type="button" variant="secondary" onClick={addOne}>Add</Button>
      </div>
      <p className="mt-1 text-xs text-ink-faint">Removing a category keeps old entries as they are.</p>
    </section>
  )
}
