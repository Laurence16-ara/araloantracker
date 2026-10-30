import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useData } from '../../lib/data.jsx'
import { peso, fmtDate, SCHEDULES, interestFor, todayPH } from '../../lib/loanMath.js'
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, Segmented } from '../../components/ui.jsx'
import { PaymentModal, SignLinkBox } from '../../components/admin.jsx'
import ContractView from '../../components/ContractView.jsx'
import { payoutLabel } from '../../lib/payout.js'

export default function LoanDetail() {
  const { id } = useParams()
  const { loansById, settings, reload } = useData()
  const nav = useNavigate()
  const loan = loansById[id]
  const [pay, setPay] = useState(false)
  const [edit, setEdit] = useState(false)
  const [contract, setContract] = useState(false)
  if (!loan) return <Empty>Loan not found. <Link className="underline" to="/admin/records">Back to records</Link></Empty>
  const s = loan.state
  const c = loan.client

  const update = async (patch) => {
    const { error } = await supabase.from('loans').update(patch).eq('id', loan.id)
    if (error) alert(error.message)
    reload()
  }
  const delPayment = async (p) => {
    if (!confirm(`Delete payment of ${peso(p.amount)} on ${fmtDate(p.paid_on)}?`)) return
    await supabase.from('payments').delete().eq('id', p.id)
    if (loan.status === 'paid' && loan.state.paid - Number(p.amount) < loan.state.total) await supabase.from('loans').update({ status: 'active', paid_at: null }).eq('id', loan.id)
    reload()
  }
  const del = async () => {
    if (!confirm('Delete this loan and all its payments? This cannot be undone.')) return
    await supabase.from('loans').delete().eq('id', loan.id)
    await reload()
    nav(-1)
  }

  return (
    <>
      <div className="mb-4 text-sm"><button onClick={() => nav(-1)} className="font-semibold text-ink-soft hover:text-ink">← Back</button></div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Badge status={s.display} />{loan.source === 'import' && <span className="text-xs text-ink-faint">from old sheet</span>}</div>
          <h1 className="mt-1 font-serif text-[28px] font-semibold leading-tight">
            <Link to={`/admin/clients/${c.id}`} className="hover:underline">{c.full_name}</Link>
          </h1>
          <div className="text-sm text-ink-soft">Loan #{loan.loan_no} · {SCHEDULES[loan.schedule].label} · {Number(loan.interest_rate)}% interest</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {loan.status === 'active' && <Button onClick={() => setPay(true)}>+ Add payment</Button>}
          {loan.signature && <Button variant="secondary" onClick={() => setContract(true)}>Contract</Button>}
          <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>
        </div>
      </div>

      {loan.note && <div className="mb-4 rounded-lg bg-paper px-3 py-2 text-sm text-ink-soft">📝 {loan.note}</div>}
      {loan.payout_method && <div className="mb-4 rounded-lg bg-paper px-3 py-2 text-sm"><span className="text-ink-soft">Loan sent to:</span> <b className="num">{payoutLabel(loan)}</b></div>}
      {loan.status === 'awaiting_signature' && <div className="mb-4"><SignLinkBox loan={loan} client={c} /></div>}
      {loan.status === 'for_release' && (
        <div className="mb-4 rounded-xl border border-amber/30 bg-amber-light px-4 py-3 text-sm">Signed and waiting for release. <Link to="/admin/applications" className="font-semibold underline">Go to Applications</Link></div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Box label="Loan" value={peso(loan.principal)} sub={`released ${fmtDate(loan.release_date)}`} />
        <Box label="Interest" value={peso(loan.interest)} sub={`total ${peso(s.total)}`} />
        <Box label="Paid" value={peso(s.paid)} sub={`${loan.payments.length} payment${loan.payments.length === 1 ? '' : 's'}`} />
        <Box label="Balance" value={peso(s.balance)} sub={s.dueDate ? `due ${fmtDate(s.dueDate)}` : ''} tone={s.isOverdue ? 'text-rust' : 'text-moss'} />
      </div>

      {(s.penaltyAccrued > 0 || loan.penalty_waived || s.penaltyPaid > 0) && (
        <Card className="mt-3 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">
            <div className="font-semibold">Late penalty ({settings.penalty_rate}% per day)</div>
            <div className="text-ink-soft">
              {loan.penalty_waived ? 'Waived' : <>Total {peso(s.penaltyAccrued)} · collected {peso(s.penaltyPaid)} · <b className="text-rust">unpaid {peso(s.penaltyBalance)}</b></>}
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => update({ penalty_waived: !loan.penalty_waived })}>
            {loan.penalty_waived ? 'Charge penalty again' : 'Waive penalty'}
          </Button>
        </Card>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <h2 className="border-b border-line px-4 py-3 font-semibold">Payment schedule</h2>
          {s.installments.length ? (
            <div className="overflow-x-auto"><table className="tbl w-full">
              <thead><tr><th>Due</th><th className="!text-right">Amount</th><th className="!text-right">Paid</th><th>Status</th></tr></thead>
              <tbody>
                {s.installments.map((i) => (
                  <tr key={i.n}>
                    <td className="num">{fmtDate(i.due, { weekday: 'short', month: 'short', day: 'numeric', year: '2-digit' })}</td>
                    <td className="text-right num">{peso(i.amount)}</td>
                    <td className="text-right num">{peso(i.paid)}</td>
                    <td>
                      <Badge status={i.status} />
                      {i.daysLate > 0 && <span className="ml-1.5 text-[11px] text-rust">{i.daysLate}d late{!loan.penalty_waived && i.penalty > 0 ? ` · ${peso(i.penalty)}` : ''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <Empty>Schedule starts when the loan is released</Empty>}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="font-semibold">Payments received</h2>
            {loan.status === 'active' && <Button size="sm" onClick={() => setPay(true)}>+ Add payment</Button>}
          </div>
          {loan.payments.length ? (
            <div className="overflow-x-auto"><table className="tbl w-full">
              <thead><tr><th>Date</th><th className="!text-right">Amount</th><th className="!text-right">Penalty</th><th>Method</th><th /></tr></thead>
              <tbody>
                {loan.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="num">{fmtDate(p.paid_on)}{p.note && <div className="max-w-[160px] truncate text-[11px] text-ink-faint">{p.note}</div>}</td>
                    <td className="text-right font-semibold num">{peso(p.amount)}</td>
                    <td className="text-right num text-ink-soft">{Number(p.penalty) ? peso(p.penalty) : '—'}</td>
                    <td className="capitalize text-ink-soft">{p.method}</td>
                    <td className="text-right"><button onClick={() => delPayment(p)} className="text-xs text-ink-faint hover:text-rust">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <Empty>No payments yet</Empty>}
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
        {loan.status === 'active' && <Button size="sm" variant="secondary" onClick={() => confirm('Mark this loan as fully paid (even if the balance is not zero)?') && update({ status: 'paid', paid_at: todayPH() })}>Mark as fully paid</Button>}
        {loan.status === 'paid' && <Button size="sm" variant="secondary" onClick={() => update({ status: 'active', paid_at: null })}>Reopen loan</Button>}
        {['awaiting_signature', 'for_release'].includes(loan.status) && <Button size="sm" variant="danger" onClick={() => confirm('Cancel this loan?') && update({ status: 'cancelled', sign_token: null })}>Cancel loan</Button>}
        <Button size="sm" variant="danger" onClick={del}>Delete loan</Button>
      </div>

      <PaymentModal open={pay} onClose={() => setPay(false)} loan={loan} />
      <EditLoanModal open={edit} onClose={() => setEdit(false)} loan={loan} />
      <Modal open={contract} onClose={() => setContract(false)} title="Signed contract" wide>
        <ContractView text={loan.contract_text} lenderName={settings.lender_name} lenderSignature={settings.lender_signature} borrowerName={c.full_name} signature={loan.signature} signedAt={loan.signed_at} signedName={loan.signed_name} />
        <div className="no-print mt-3 flex justify-end"><Button variant="secondary" onClick={() => printContract(loan, settings, c)}>Print / Save PDF</Button></div>
      </Modal>
    </>
  )
}

function printContract(loan, settings, c) {
  const w = window.open('', '_blank')
  const esc = (t) => String(t || '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m])
  const body = esc(loan.contract_text).split(/\n\s*\n/).map((p) => `<p>${p.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`).join('')
  w.document.write(`<!doctype html><html><head><title>Loan Agreement #${loan.loan_no} - ${esc(c.full_name)}</title>
  <style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px;font-size:14px;line-height:1.6;color:#111}h1{text-align:center;letter-spacing:2px;font-size:22px}.sig{display:flex;gap:48px;margin-top:48px}.sig div{flex:1}.line{border-top:1px solid #111;padding-top:4px}.img{height:70px;display:flex;align-items:flex-end}img{max-height:70px}small{color:#666}</style></head>
  <body><h1>LOAN AGREEMENT</h1>${body}<div class="sig"><div><div class="img">${settings.lender_signature ? `<img src="${settings.lender_signature}">` : ''}</div><div class="line"><b>${esc(settings.lender_name)}</b><br><small>Lender</small></div></div>
  <div><div class="img">${loan.signature ? `<img src="${loan.signature}">` : ''}</div><div class="line"><b>${esc(loan.signed_name || c.full_name)}</b><br><small>Borrower · signed electronically ${loan.signed_at ? new Date(loan.signed_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : ''}</small></div></div></div>
  <script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}

function Box({ label, value, sub, tone = '' }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`mt-0.5 font-serif text-xl font-semibold num ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-ink-faint">{sub}</div>}
    </Card>
  )
}

function EditLoanModal({ open, onClose, loan }) {
  const { reload } = useData()
  const [f, setF] = useState({})
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setF({ principal: loan.principal, interest_rate: loan.interest_rate, interest: loan.interest, schedule: loan.schedule, release_date: loan.release_date || '', note: loan.note || '' })
  }, [open, loan])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save() {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('loans').update({
      principal: Number(f.principal), interest_rate: Number(f.interest_rate), interest: Number(f.interest),
      schedule: f.schedule, release_date: f.release_date || null, note: f.note || null,
    }).eq('id', loan.id)
    setBusy(false)
    if (error) return setErr(error.message)
    reload(); onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Edit loan">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loan amount"><input className="input num" value={f.principal ?? ''} onChange={(e) => setF({ ...f, principal: e.target.value, interest: interestFor(e.target.value, f.interest_rate) })} /></Field>
        <Field label="Release date"><input className="input" type="date" value={f.release_date ?? ''} onChange={set('release_date')} /></Field>
        <Field label="Interest %"><input className="input num" value={f.interest_rate ?? ''} onChange={(e) => setF({ ...f, interest_rate: e.target.value, interest: interestFor(f.principal, e.target.value) })} /></Field>
        <Field label="Interest amount"><input className="input num" value={f.interest ?? ''} onChange={set('interest')} /></Field>
        <div className="col-span-2"><span className="label">Schedule</span><Segmented value={f.schedule} onChange={(v) => setF({ ...f, schedule: v })} options={Object.entries(SCHEDULES).map(([k, s]) => [k, s.label])} /></div>
        <Field label="Note" className="col-span-2"><input className="input" value={f.note ?? ''} onChange={set('note')} /></Field>
      </div>
      <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></div>
    </Modal>
  )
}
