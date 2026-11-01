import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useData } from '../../lib/data.jsx'
import { peso, fmtDate, SCHEDULES, round2, todayPH, schedulePlan } from '../../lib/loanMath.js'
import { payoutLabel } from '../../lib/payout.js'
import { randomToken } from '../../lib/utils.js'
import { buildContractText } from '../../lib/contract.js'
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Segmented } from '../../components/ui.jsx'
import { PrivateImage, SignLinkBox } from '../../components/admin.jsx'
import SignedContract, { CopyContractImageButton } from '../../components/SignedContract.jsx'

export default function Applications() {
  const { loans } = useData()
  const toRelease = loans.filter((l) => l.status === 'for_release').sort((a, b) => (a.signed_at < b.signed_at ? -1 : 1))
  const waiting = loans.filter((l) => l.status === 'awaiting_signature')
  return (
    <>
      <PageHeader title="Applications" sub="New online applications and signed reloans waiting for release" />
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-faint">To review & release ({toRelease.length})</h2>
      <div className="space-y-4">
        {toRelease.length ? toRelease.map((l) => <ReleaseCard key={l.id} loan={l} />) : <Card><Empty>No applications waiting</Empty></Card>}
      </div>
      <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wider text-ink-faint">Waiting for client signature ({waiting.length})</h2>
      <div className="space-y-4">
        {waiting.length ? waiting.map((l) => <WaitingCard key={l.id} loan={l} />) : <Card><Empty>No links waiting</Empty></Card>}
      </div>
    </>
  )
}

function ReleaseCard({ loan }) {
  const { reload, loansByClient, settings } = useData()
  const c = loan.client
  const isNew = c?.status === 'pending'
  const [releaseDate, setReleaseDate] = useState(loan.release_date || todayPH())
  const [schedule, setSchedule] = useState(loan.schedule || 'semi_monthly')
  const signedTerms = Boolean(loan.signature)
  const [copied, setCopied] = useState(false)
  const plan = schedulePlan({ ...loan, schedule, release_date: releaseDate })
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [contract, setContract] = useState(false)
  const others = (loansByClient[c?.id] || []).filter((x) => x.id !== loan.id && x.status === 'active')
  const total = round2(Number(loan.principal) + Number(loan.interest))

  async function release() {
    setBusy('release'); setErr(null)
    const { error } = await supabase.rpc('release_loan', { p_loan_id: loan.id, p_release_date: releaseDate, p_schedule: schedule })
    setBusy(null)
    if (error) return setErr(error.message)
    reload()
  }
  async function reject() {
    if (!confirm(`Reject this ${isNew ? 'application' : 'loan'} from ${c.full_name}?`)) return
    setBusy('reject')
    await supabase.from('loans').update({ status: 'rejected' }).eq('id', loan.id)
    if (isNew && !(loansByClient[c.id] || []).some((x) => x.id !== loan.id)) await supabase.from('clients').update({ status: 'rejected' }).eq('id', c.id)
    setBusy(null)
    reload()
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link to={`/admin/clients/${c.id}`} className="text-lg font-bold hover:underline">{c.full_name}</Link>
            {isNew ? <Badge status="pending">New client</Badge> : <Badge status="approved">Returning</Badge>}
          </div>
          <div className="text-xs text-ink-faint">#{loan.loan_no} · {loan.source === 'online' ? 'Applied online' : 'Reloan'} · signed {loan.signed_at ? fmtDate(loan.signed_at.slice(0, 10)) : '—'}</div>
        </div>
        <div className="text-right">
          <div className="font-serif text-2xl font-semibold num">{peso(loan.principal)}</div>
          <div className="text-xs text-ink-soft">total {peso(total)}</div>
        </div>
      </div>

      {isNew && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_1.2fr]">
          <div><div className="label">Valid ID · {c.id_type}</div><PrivateImage path={c.id_photo_path} alt="ID" /></div>
          <div><div className="label">Selfie with ID</div><PrivateImage path={c.selfie_path} alt="Selfie" />
            {c.signature && <div className="mt-3"><div className="label">Signature on application</div><img src={c.signature} alt="Applicant's signature" className="mt-1 h-20 w-full rounded-lg border border-line bg-white object-contain p-2" /></div>}
          </div>
          <dl className="space-y-1.5 text-sm">
            <Info k="Mobile" v={c.phone} />
            <Info k="Address" v={c.address} />

          </dl>
        </div>
      )}
      {others.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-light px-3 py-2 text-sm text-amber">
          Still has {others.length} unpaid loan{others.length > 1 ? 's' : ''} · balance {peso(others.reduce((s, x) => s + x.state.balance, 0))}
          {others.some((x) => x.state.isOverdue) && <b> · overdue</b>}
        </div>
      )}

      {loan.payout_method && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-moss/30 bg-moss-light/50 px-3 py-2.5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-moss">Send loan to</div>
            <div className="font-semibold num">{payoutLabel(loan)}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(loan.payout_account || '').catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
            {copied ? 'Copied ✓' : 'Copy number'}
          </Button>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <span className="label">Payment schedule</span>
        <Segmented value={schedule} onChange={setSchedule} disabled={signedTerms} options={Object.entries(SCHEDULES).map(([k, x]) => [k, x.label])} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
          {plan.map((p) => <span key={p.n} className="num">{fmtDate(p.due, { month: 'short', day: 'numeric' })}: <b className="text-ink">{peso(p.amount)}</b></span>)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Release date" className="w-40"><input className="input" type="date" value={releaseDate} disabled={signedTerms} onChange={(e) => setReleaseDate(e.target.value)} /></Field>
        <Button onClick={release} loading={busy === 'release'}>Release loan</Button>
        <Button variant="secondary" onClick={() => setContract(true)}>View contract</Button>
        <CopyContractImageButton loan={loan} client={c} settings={settings} size="md" />
        <Button variant="danger" onClick={reject} loading={busy === 'reject'}>Reject</Button>
      </div>
      <div className="mt-2"><ErrorNote>{err}</ErrorNote></div>
      <Modal open={contract} onClose={() => setContract(false)} title="Signed contract" wide>
        <SignedContract loan={loan} client={c} settings={settings} />
      </Modal>
    </Card>
  )
}

function Info({ k, v }) {
  return <div><dt className="text-xs text-ink-faint">{k}</dt><dd className="font-medium">{v || '—'}</dd></div>
}

function WaitingCard({ loan }) {
  const { reload, settings } = useData()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [schedule, setSchedule] = useState(loan.schedule || 'semi_monthly')
  const [releaseDate, setReleaseDate] = useState(loan.release_date || todayPH())
  const expired = loan.sign_expires_at && new Date(loan.sign_expires_at) < new Date()
  const ready = loan.sign_token && loan.contract_text && !expired
  async function prepare() {
    setBusy(true); setErr(null)
    const contractText = buildContractText({ loan: { ...loan, schedule, release_date: releaseDate }, client: loan.client, settings })
    const { error } = await supabase.rpc('prepare_sign_request', { p_loan_id: loan.id, p_schedule: schedule, p_release_date: releaseDate, p_contract_text: contractText, p_token: randomToken() })
    setBusy(false)
    if (error) return setErr(error.message)
    reload()
  }
  async function cancel() {
    if (!confirm('Cancel this loan?')) return
    const { error } = await supabase.from('loans').update({ status: 'cancelled', sign_token: null }).eq('id', loan.id)
    if (error) setErr(error.message); else reload()
  }
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to={`/admin/loans/${loan.id}`} className="font-bold hover:underline">{loan.client.full_name}</Link>
          <div className="text-xs text-ink-faint">{peso(loan.principal)} · {SCHEDULES[loan.schedule].label} · release {fmtDate(loan.release_date)}</div>
        </div>
        {expired && <Badge status="overdue">Link expired</Badge>}
      </div>
      <p className="mb-3 text-sm text-ink-soft">Choose the final terms first. The applicant signs this exact schedule and release date before the loan can be released.</p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Payment schedule"><Segmented value={schedule} onChange={setSchedule} options={Object.entries(SCHEDULES).map(([k, x]) => [k, x.label])} /></Field>
        <Field label="Release date"><input className="input" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} /></Field>
      </div>
      {ready && <SignLinkBox loan={loan} client={loan.client} />}
      {expired && <p className="text-sm text-ink-soft">The previous link expired; preparing again will issue a new 48-hour link.</p>}
      <ErrorNote>{err}</ErrorNote>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={prepare} loading={busy}>{ready ? 'Update contract and link' : 'Prepare contract and issue link'}</Button>
        <Button size="sm" variant="danger" onClick={cancel}>Cancel loan</Button>
      </div>
    </Card>
  )
}
