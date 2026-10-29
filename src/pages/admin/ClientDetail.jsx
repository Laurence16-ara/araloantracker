import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useData } from '../../lib/data.jsx'
import { peso } from '../../lib/loanMath.js'
import { Badge, Button, Card, Empty, ErrorNote, Modal, Stat } from '../../components/ui.jsx'
import { ClientModal, LoanTable, NewLoanModal, PrivateImage } from '../../components/admin.jsx'

export default function ClientDetail() {
  const { id } = useParams()
  const { clientsById, clients, loansByClient, reload } = useData()
  const nav = useNavigate()
  const c = clientsById[id]
  const [edit, setEdit] = useState(false)
  const [newLoan, setNewLoan] = useState(false)
  const [merge, setMerge] = useState(false)

  const loans = useMemo(() => (loansByClient[id] || []).slice().sort((a, b) => (b.release_date || '9').localeCompare(a.release_date || '9')), [loansByClient, id])
  if (!c) return <Empty>Client not found. <Link className="underline" to="/admin/clients">Back</Link></Empty>

  const real = loans.filter((l) => ['active', 'paid'].includes(l.status))
  const active = real.filter((l) => l.status === 'active')
  const tracked = real.filter((l) => l.source !== 'import' && l.status === 'paid')
  const onTime = tracked.filter((l) => l.state.installments.every((i) => i.status === 'paid')).length
  const referrer = c.referred_by && clientsById[c.referred_by]
  const referrals = clients.filter((x) => x.referred_by === c.id)

  const setStatus = async (status) => {
    await supabase.from('clients').update({ status }).eq('id', c.id)
    reload()
  }
  const remove = async () => {
    if (loans.length) return alert('This client has loans. Merge them into another client instead, or delete the loans first.')
    if (!confirm(`Delete ${c.full_name}?`)) return
    await supabase.from('clients').delete().eq('id', c.id)
    await reload()
    nav('/admin/clients')
  }

  return (
    <>
      <div className="mb-4 text-sm"><Link to="/admin/clients" className="font-semibold text-ink-soft hover:text-ink">← Clients</Link></div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-[28px] font-semibold leading-tight">{c.full_name}</h1>
            {c.status !== 'approved' && <Badge status={c.status} />}
          </div>
          {c.aliases && <div className="text-sm text-ink-faint">Also: {c.aliases}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setNewLoan(true)} disabled={c.status === 'blocked'}>+ New loan</Button>
          <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance now" value={peso(active.reduce((s, l) => s + l.state.balance, 0))} sub={`${active.length} unpaid loan${active.length === 1 ? '' : 's'}`} tone={active.some((l) => l.state.isOverdue) ? 'rust' : undefined} />
        <Stat label="Total borrowed" value={peso(real.reduce((s, l) => s + Number(l.principal), 0))} sub={`${real.length} loans`} />
        <Stat label="Interest earned" value={peso(real.filter((l) => l.status === 'paid').reduce((s, l) => s + Number(l.interest), 0))} tone="moss" />
        <Stat label="On-time rate" value={tracked.length ? `${Math.round((onTime / tracked.length) * 100)}%` : '—'} sub={tracked.length ? `${onTime} of ${tracked.length} loans` : 'tracked from now on'} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_2fr] [&>*]:min-w-0">
        <Card className="space-y-4 p-4">
          <dl className="space-y-2 text-sm">
            <Info k="Mobile" v={c.phone} />
            <Info k="Address" v={c.address} />
            <Info k="Facebook" v={c.facebook} />
            <Info k="Referred by" v={referrer ? <Link className="underline" to={`/admin/clients/${referrer.id}`}>{referrer.full_name}</Link> : c.referred_by_text} />
            {referrals.length > 0 && <Info k="Referred" v={referrals.map((r, i) => <span key={r.id}>{i > 0 && ', '}<Link className="underline" to={`/admin/clients/${r.id}`}>{r.full_name}</Link></span>)} />}
            <Info k="Notes" v={c.notes} />
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <div><div className="label">ID {c.id_type && `· ${c.id_type}`}</div><PrivateImage path={c.id_photo_path} alt="ID" /></div>
            <div><div className="label">Selfie</div><PrivateImage path={c.selfie_path} alt="Selfie" /></div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {c.status === 'blocked'
              ? <Button size="sm" variant="secondary" onClick={() => setStatus('approved')}>Unblock</Button>
              : <Button size="sm" variant="danger" onClick={() => confirm(`Block ${c.full_name} from new loans?`) && setStatus('blocked')}>Block</Button>}
            <Button size="sm" variant="secondary" onClick={() => setMerge(true)}>Merge into…</Button>
            <Button size="sm" variant="ghost" onClick={remove}>Delete</Button>
          </div>
        </Card>
        <Card>
          <h2 className="border-b border-line px-4 py-3 font-semibold">Loans</h2>
          <LoanTable loans={loans} showClient={false} empty="No loans yet" />
        </Card>
      </div>

      <ClientModal open={edit} onClose={() => setEdit(false)} client={c} />
      <NewLoanModal open={newLoan} onClose={() => setNewLoan(false)} clientId={c.id} />
      <MergeModal open={merge} onClose={() => setMerge(false)} source={c} />
    </>
  )
}

function Info({ k, v }) {
  return <div><dt className="text-xs text-ink-faint">{k}</dt><dd className="font-medium">{v || '—'}</dd></div>
}

// Move all loans of `source` into another client, keep the names as aliases, delete `source`.
function MergeModal({ open, onClose, source }) {
  const { clients, reload } = useData()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const list = clients.filter((x) => x.id !== source.id && (!q || `${x.full_name} ${x.aliases || ''}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 8)

  async function doMerge() {
    setBusy(true); setErr(null)
    try {
      const names = new Set([...(target.aliases || '').split(',').map((s) => s.trim()).filter(Boolean), source.full_name, ...(source.aliases || '').split(',').map((s) => s.trim()).filter(Boolean)])
      names.delete(target.full_name)
      const patch = { aliases: [...names].join(', ') || null }
      for (const k of ['phone', 'address', 'facebook', 'id_type', 'id_photo_path', 'selfie_path', 'referred_by', 'notes']) if (!target[k] && source[k]) patch[k] = source[k]
      let r = await supabase.from('loans').update({ client_id: target.id }).eq('client_id', source.id)
      if (r.error) throw r.error
      r = await supabase.from('clients').update({ referred_by: target.id }).eq('referred_by', source.id)
      if (r.error) throw r.error
      r = await supabase.from('clients').update(patch).eq('id', target.id)
      if (r.error) throw r.error
      r = await supabase.from('clients').delete().eq('id', source.id)
      if (r.error) throw r.error
      await reload()
      onClose()
      nav(`/admin/clients/${target.id}`)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Merge ${source.full_name}`}>
      <p className="mb-3 text-sm text-ink-soft">Use this when the same person is listed twice. All loans move to the client you pick, and "{source.full_name}" is kept as another name.</p>
      {target ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-paper p-3 text-sm">Move all loans of <b>{source.full_name}</b> into <b>{target.full_name}</b>?</div>
          <ErrorNote>{err}</ErrorNote>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTarget(null)}>Back</Button><Button onClick={doMerge} loading={busy}>Merge</Button></div>
        </div>
      ) : (
        <>
          <input className="input" placeholder="Search the client to keep…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="mt-1 rounded-lg border border-line">
            {list.map((x) => (
              <button key={x.id} onClick={() => setTarget(x)} className="block w-full border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-paper">
                <span className="font-semibold">{x.full_name}</span>{x.aliases && <span className="text-xs text-ink-faint"> · {x.aliases}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
