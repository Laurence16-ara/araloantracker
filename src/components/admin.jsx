import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useData } from '../lib/data.jsx'
import { SCHEDULES, peso, fmtDate, interestFor, round2, schedulePlan, todayPH } from '../lib/loanMath.js'
import { compressImage, normalizePhone, randomToken, cx } from '../lib/utils.js'
import { buildContractText } from '../lib/contract.js'
import { Badge, Button, ErrorNote, Field, Modal, Segmented, Empty } from './ui.jsx'

// ---------------------------------------------------------------- Loan list
export function LoanTable({ loans, showClient = true, empty = 'No loans', extra }) {
  const nav = useNavigate()
  if (!loans.length) return <Empty>{empty}</Empty>
  return (
    <>
    {/* Phone: compact list */}
    <ul className="sm:hidden">
      {loans.map((l) => (
        <li key={l.id} onClick={() => nav(`/admin/loans/${l.id}`)} className="flex cursor-pointer items-center justify-between gap-3 border-t border-line px-4 py-2.5 active:bg-paper">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{showClient ? l.client?.full_name : peso(l.principal)}</div>
            <div className="text-xs text-ink-faint num">
              {fmtDate(l.release_date || l.created_at?.slice(0, 10), { month: 'short', day: 'numeric', year: '2-digit' })}
              {showClient ? ` · ${peso(l.principal)}` : ` · +${peso(l.interest)} interest`}
            </div>
          </div>
          <div className="shrink-0 text-right">
            {l.status === 'active' && <div className="text-sm font-semibold num">{peso(l.state.balance)}</div>}
            <Badge status={l.state.display} />
          </div>
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto sm:block">
      <table className="tbl w-full">
        <thead>
          <tr>
            <th>Date</th>
            {showClient && <th>Name</th>}
            <th className="!text-right">Loan</th>
            <th className="!text-right">Interest</th>
            <th className="!text-right">Balance</th>
            <th>Status</th>
            {extra && <th>{extra.label}</th>}
          </tr>
        </thead>
        <tbody>
          {loans.map((l) => (
            <tr key={l.id} className="click" onClick={() => nav(`/admin/loans/${l.id}`)}>
              <td className="text-ink-soft num">{fmtDate(l.release_date || l.created_at?.slice(0, 10), { month: 'short', day: 'numeric', year: '2-digit' })}</td>
              {showClient && <td className="max-w-[220px] truncate font-semibold">{l.client?.full_name}</td>}
              <td className="text-right num">{peso(l.principal)}</td>
              <td className="text-right num text-ink-soft">{peso(l.interest)}</td>
              <td className="text-right num font-semibold">{['active'].includes(l.status) ? peso(l.state.balance) : '—'}</td>
              <td><Badge status={l.state.display} /></td>
              {extra && <td>{extra.render(l)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

// ---------------------------------------------------------------- Signing link
export function signLink(token) {
  return `${window.location.origin}/sign/${token}`
}

export function SignLinkBox({ loan, client }) {
  const [copied, setCopied] = useState(null)
  const link = signLink(loan.sign_token)
  const total = round2(Number(loan.principal) + Number(loan.interest))
  const msg = `Hi ${client.full_name.split(' ')[0]}! Here's your loan contract for ${peso(loan.principal)} (total to pay ${peso(total)}). Please open this link and sign: ${link}\n\nThe link works for 48 hours. Thank you!`
  const copy = async (text, which) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.prompt('Copy this:', text)
    }
    setCopied(which)
    setTimeout(() => setCopied(null), 1800)
  }
  return (
    <div className="rounded-xl border border-moss/30 bg-moss-light/50 p-4">
      <div className="text-sm font-semibold text-moss">Send this link to {client.full_name.split(' ')[0]} on Messenger</div>
      <div className="mt-2 break-all rounded-lg bg-white px-3 py-2 text-[13px] num">{link}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => copy(msg, 'msg')}>{copied === 'msg' ? 'Copied ✓' : 'Copy message + link'}</Button>
        <Button size="sm" variant="secondary" onClick={() => copy(link, 'link')}>{copied === 'link' ? 'Copied ✓' : 'Copy link only'}</Button>
      </div>
      {loan.sign_expires_at && <div className="mt-2 text-xs text-ink-faint">Expires {new Date(loan.sign_expires_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- New loan
export function NewLoanModal({ open, onClose, clientId }) {
  const { clients, settings, reload, loansByClient } = useData()
  const nav = useNavigate()
  const [mode, setMode] = useState('existing')
  const [pick, setPick] = useState(clientId || '')
  const [search, setSearch] = useState('')
  const [nc, setNc] = useState({ full_name: '', phone: '', address: '' })
  const [f, setF] = useState({})
  const [interestEdited, setInterestEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [created, setCreated] = useState(null)

  useEffect(() => {
    if (!open) return
    setMode('existing'); setPick(clientId || ''); setSearch(''); setNc({ full_name: '', phone: '', address: '' })
    setF({ principal: '', interest_rate: settings?.default_rate ?? 20, interest: '', schedule: 'semi_monthly', release_date: todayPH(), sign: 'link' })
    setInterestEdited(false); setErr(null); setCreated(null)
    // Only reset when the window opens. Reloading the data after saving must not wipe the signing link screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId])

  const principal = Number(f.principal) || 0
  const interest = interestEdited ? Number(f.interest) || 0 : interestFor(principal, f.interest_rate)
  const total = round2(principal + interest)
  const plan = schedulePlan({ principal, interest, schedule: f.schedule, release_date: f.release_date })
  const client = clients.find((c) => c.id === pick)
  const active = (loansByClient[pick] || []).filter((l) => l.status === 'active')

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = clients.filter((c) => c.status !== 'rejected')
    if (!q) return list.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)).slice(0, 8)
    return list.filter((c) => `${c.full_name} ${c.aliases || ''} ${c.phone || ''}`.toLowerCase().includes(q)).slice(0, 8)
  }, [clients, search])

  async function create() {
    setErr(null)
    if (principal <= 0) return setErr('Enter the loan amount.')
    if (mode === 'existing' && !pick) return setErr('Choose a client.')
    if (mode === 'new' && !nc.full_name.trim()) return setErr('Enter the client name.')
    if (f.sign === 'link' && mode === 'new' && (!nc.phone.trim() || nc.address.trim().length < 8)) return setErr('Add the client phone and complete address before preparing a contract.')
    if (f.sign === 'link' && mode === 'existing' && (!client?.phone || !client?.address)) return setErr('Add the client phone and complete address before preparing a contract.')
    if (!f.release_date) return setErr('Enter the release date.')
    setBusy(true)
    try {
      let cid = pick
      let cl = client
      if (mode === 'new') {
        const { data, error } = await supabase.from('clients')
          .insert({ full_name: nc.full_name.trim(), phone: normalizePhone(nc.phone) || null, address: nc.address.trim() || null, status: 'approved', source: 'manual' })
          .select().single()
        if (error) throw error
        cid = data.id; cl = data
      }
      const viaLink = f.sign === 'link'
      const row = {
        client_id: cid,
        principal,
        interest_rate: Number(f.interest_rate),
        interest,
        schedule: f.schedule,
        release_date: f.release_date,
        status: viaLink ? 'awaiting_signature' : 'active',
        sign_token: null,
        sign_expires_at: null,
        source: 'manual',
      }
      const { data: loan, error } = await supabase.from('loans').insert(row).select().single()
      if (error) throw error
      if (viaLink) {
        const contractText = buildContractText({ loan, client: cl, settings })
        const { error: prepareError } = await supabase.rpc('prepare_sign_request', {
          p_loan_id: loan.id, p_schedule: f.schedule, p_release_date: f.release_date,
          p_contract_text: contractText, p_token: randomToken(),
        })
        if (prepareError) throw prepareError
        loan.schedule = f.schedule
        loan.release_date = f.release_date
        const { data: prepared, error: fetchError } = await supabase.from('loans').select('*').eq('id', loan.id).single()
        if (fetchError) throw fetchError
        Object.assign(loan, prepared)
      }
      await reload()
      if (viaLink) setCreated({ loan, client: cl })
      else { onClose(); nav(`/admin/loans/${loan.id}`) }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={created ? 'Loan created' : 'New loan'} wide>
      {created ? (
        <div className="space-y-4">
          <SignLinkBox loan={created.loan} client={created.client} />
          <p className="text-sm font-semibold">Next step: copy the message or the link above and send it to the client.</p>
          <p className="text-sm text-ink-soft">Once they sign, the loan appears in <b>Applications</b> as "Signed · to release". Release the money, then tap <b>Release</b>.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { onClose(); nav(`/admin/loans/${created.loan.id}`) }}>Open loan</Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!clientId && (
            <div className="space-y-3">
              <Segmented value={mode} onChange={setMode} options={[['existing', 'Existing client'], ['new', 'New client']]} />
              {mode === 'existing' ? (
                client ? (
                  <div className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2">
                    <div><div className="font-semibold">{client.full_name}</div><div className="text-xs text-ink-faint">{client.phone || 'No phone'}</div></div>
                    <button className="text-sm font-semibold text-moss" onClick={() => setPick('')}>Change</button>
                  </div>
                ) : (
                  <div>
                    <input className="input" placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                    <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line">
                      {matches.map((c) => (
                        <button key={c.id} onClick={() => setPick(c.id)} className="flex w-full items-center justify-between border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-paper">
                          <span className="font-semibold">{c.full_name}</span>
                          {c.status === 'blocked' ? <Badge status="blocked" /> : <span className="text-xs text-ink-faint">{c.phone}</span>}
                        </button>
                      ))}
                      {!matches.length && <div className="px-3 py-3 text-sm text-ink-faint">No match. Use "New client".</div>}
                    </div>
                  </div>
                )
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" className="sm:col-span-2"><input className="input" value={nc.full_name} onChange={(e) => setNc({ ...nc, full_name: e.target.value })} /></Field>
                  <Field label="Mobile"><input className="input" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} inputMode="tel" /></Field>
                  <Field label="Address"><input className="input" value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} /></Field>
                </div>
              )}
              {client?.status === 'blocked' && <ErrorNote>This client is blocked.</ErrorNote>}
              {active.length > 0 && (
                <div className="rounded-lg bg-amber-light px-3 py-2 text-sm text-amber">
                  Has {active.length} unpaid loan{active.length > 1 ? 's' : ''}: balance {peso(active.reduce((s, l) => s + l.state.balance, 0))}
                  {active.some((l) => l.state.isOverdue) && ' · some overdue'}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Loan amount">
              <input className="input text-lg font-semibold num" inputMode="numeric" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value.replace(/[^\d.]/g, '') })} placeholder="₱" />
            </Field>
            <Field label="Release date">
              <input className="input" type="date" value={f.release_date || ''} onChange={(e) => setF({ ...f, release_date: e.target.value })} />
            </Field>
            <Field label="Interest rate (%)" hint="Default 20%. Change for special clients.">
              <input className="input num" inputMode="decimal" value={f.interest_rate} onChange={(e) => { setInterestEdited(false); setF({ ...f, interest_rate: e.target.value }) }} />
            </Field>
            <Field label="Interest amount">
              <input className="input num" inputMode="decimal" value={interestEdited ? f.interest : interest} onChange={(e) => { setInterestEdited(true); setF({ ...f, interest: e.target.value }) }} />
            </Field>
          </div>
          <div>
            <span className="label">Payment schedule</span>
            <Segmented value={f.schedule} onChange={(v) => setF({ ...f, schedule: v })} options={Object.entries(SCHEDULES).map(([k, s]) => [k, s.label])} />
          </div>
          {principal > 0 && (
            <div className="rounded-lg bg-paper p-3 text-sm">
              <div className="flex justify-between font-bold"><span>Total to collect</span><span className="num">{peso(total)}</span></div>
              {plan.map((p) => (
                <div key={p.n} className="flex justify-between text-ink-soft"><span>{fmtDate(p.due, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="num">{peso(p.amount)}</span></div>
              ))}
            </div>
          )}
          <div>
            <span className="label">Contract</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {[['link', 'Send signing link', 'Client signs on their phone'], ['paper', 'Skip signing', 'Already signed on paper — mark as released now']].map(([v, t, d]) => (
                <button key={v} type="button" onClick={() => setF({ ...f, sign: v })}
                  className={cx('rounded-lg border-2 px-3 py-2 text-left', f.sign === v ? 'border-moss bg-moss-light/40' : 'border-line')}>
                  <div className="text-sm font-semibold">{t}</div><div className="text-xs text-ink-faint">{d}</div>
                </button>
              ))}
            </div>
          </div>
          <ErrorNote>{err}</ErrorNote>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={create} loading={busy}>{f.sign === 'link' ? 'Create & get link' : 'Create loan'}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Payment
export function PaymentModal({ open, onClose, loan, payment }) {
  const { reload } = useData()
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!open || !loan) return
    const next = loan.state.nextDue
    if (payment) setF({ amount: String(Number(payment.amount)), penalty: Number(payment.penalty) ? String(Number(payment.penalty)) : '', paid_on: payment.paid_on, method: payment.method || 'bank', note: payment.note || '' })
    else setF({ amount: String(next ? next.remaining : loan.state.balance), penalty: '', paid_on: todayPH(), method: 'bank', note: '' })
    setErr(null)
  }, [open, loan, payment])
  if (!loan) return null
  // When editing, work out the balance as if this payment was not there yet.
  const balance = round2(loan.state.balance + (payment ? Number(payment.amount) : 0))
  async function save() {
    const amount = Number(f.amount) || 0
    const penalty = Number(f.penalty) || 0
    if (amount <= 0 && penalty <= 0) return setErr('Enter an amount.')
    setBusy(true); setErr(null)
    if (!f.paid_on) { setBusy(false); return setErr('Choose the date.') }
    const row = { amount, penalty, paid_on: f.paid_on, method: f.method, note: f.note || null }
    const { error } = payment
      ? await supabase.from('payments').update(row).eq('id', payment.id)
      : await supabase.from('payments').insert({ loan_id: loan.id, ...row })
    const paidAfter = round2(loan.state.paid - (payment ? Number(payment.amount) : 0) + amount)
    if (!error && paidAfter >= loan.state.total && loan.status === 'active') {
      await supabase.from('loans').update({ status: 'paid', paid_at: f.paid_on }).eq('id', loan.id)
    } else if (!error && payment && loan.status === 'paid') {
      // Keep the loan in step with the edited payment: reopen it if it is no longer covered, else fix the paid date.
      if (paidAfter < loan.state.total) await supabase.from('loans').update({ status: 'active', paid_at: null }).eq('id', loan.id)
      else {
        const last = loan.payments.map((p) => (p.id === payment.id ? f.paid_on : p.paid_on)).sort().pop()
        if (last && last !== loan.paid_at) await supabase.from('loans').update({ paid_at: last }).eq('id', loan.id)
      }
    }
    setBusy(false)
    if (error) return setErr(error.message)
    await reload()
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={payment ? 'Edit payment' : 'Add payment'}>
      <div className="space-y-3">
        <div className="rounded-lg bg-paper p-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-soft">Balance</span><span className="font-bold num">{peso(balance)}</span></div>
          {!payment && loan.state.nextDue && <div className="flex justify-between"><span className="text-ink-soft">Next due {fmtDate(loan.state.nextDue.due)}</span><span className="num">{peso(loan.state.nextDue.remaining)}</span></div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount received" hint="Full or partial"><input className="input font-semibold num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Date"><input className="input" type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
          <Field label="Late fee collected" hint="Optional. Not part of the balance"><input className="input num" inputMode="decimal" value={f.penalty} onChange={(e) => setF({ ...f, penalty: e.target.value })} placeholder="0" /></Field>
          <Field label="Method">
            <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              <option value="bank">Bank</option><option value="gcash">GCash</option><option value="cash">Cash</option><option value="other">Other</option>
            </select>
          </Field>
        </div>
        {Number(f.amount) > 0 && Number(f.amount) < balance && (
          <div className="rounded-lg bg-amber-light px-3 py-2 text-sm text-amber">Partial payment. Balance after this: <b className="num">{peso(round2(balance - Number(f.amount)))}</b></div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft" onClick={() => setF({ ...f, amount: String(balance) })}>Full balance {peso(balance)}</button>
        </div>
        <Field label="Note (optional)"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>{payment ? 'Save changes' : 'Save payment'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Client edit
export function ClientModal({ open, onClose, client }) {
  const { reload } = useData()
  const [f, setF] = useState({})
  const [files, setFiles] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!open) return
    setF({ full_name: '', aliases: '', phone: '', address: '', facebook: '', id_type: '', notes: '', ...(client || {}) })
    setFiles({}); setErr(null)
  }, [open, client])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save() {
    if (!f.full_name?.trim()) return setErr('Name is required.')
    setBusy(true); setErr(null)
    try {
      const row = { full_name: f.full_name.trim(), aliases: f.aliases || null, phone: normalizePhone(f.phone) || null, address: f.address || null, facebook: f.facebook || null, id_type: f.id_type || null, notes: f.notes || null }
      let id = client?.id
      if (id) {
        const { error } = await supabase.from('clients').update(row).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('clients').insert({ ...row, status: 'approved' }).select().single()
        if (error) throw error
        id = data.id
      }
      for (const [k, file] of Object.entries(files)) {
        const blob = await compressImage(file)
        const path = `clients/${id}-${k}-${Date.now()}.jpg`
        const { error } = await supabase.storage.from('kyc').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        await supabase.from('clients').update({ [k === 'id' ? 'id_photo_path' : 'selfie_path']: path }).eq('id', id)
      }
      await reload()
      onClose(id)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={() => onClose()} title={client ? 'Edit client' : 'New client'} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2"><input className="input" value={f.full_name || ''} onChange={set('full_name')} /></Field>
        <Field label="Other names used" hint="e.g. nicknames from the old sheet" className="sm:col-span-2"><input className="input" value={f.aliases || ''} onChange={set('aliases')} /></Field>
        <Field label="Mobile"><input className="input" value={f.phone || ''} onChange={set('phone')} inputMode="tel" /></Field>
        <Field label="Facebook"><input className="input" value={f.facebook || ''} onChange={set('facebook')} /></Field>
        <Field label="Address" className="sm:col-span-2"><input className="input" value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="ID type"><input className="input" value={f.id_type || ''} onChange={set('id_type')} /></Field>
        <div />
        <Field label={client?.id_photo_path ? 'Replace ID photo' : 'ID photo'}><input type="file" accept="image/*" className="text-sm" onChange={(e) => setFiles({ ...files, id: e.target.files[0] })} /></Field>
        <Field label={client?.selfie_path ? 'Replace selfie' : 'Selfie with ID'}><input type="file" accept="image/*" className="text-sm" onChange={(e) => setFiles({ ...files, selfie: e.target.files[0] })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes || ''} onChange={set('notes')} /></Field>
      </div>
      <div className="mt-4"><ErrorNote>{err}</ErrorNote></div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onClose()}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Private photo
// ---------------------------------------------------------------- ID photos (one image: selfie with ID on top, ID below)
async function loadPrivatePhoto(path) {
  if (!path) return null
  const { data } = await supabase.storage.from('kyc').createSignedUrl(path, 600)
  if (!data?.signedUrl) return null
  const res = await fetch(data.signedUrl)
  if (!res.ok) return null
  const objUrl = URL.createObjectURL(await res.blob())
  try {
    const img = new Image()
    img.src = objUrl
    await img.decode()
    // Keep a copy on a canvas so the temporary link can be released.
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return c
  } finally {
    URL.revokeObjectURL(objUrl)
  }
}

// turns: quarter turns clockwise applied to the ID photo.
function drawKycSheet(selfie, idPhoto, turns) {
  const W = 1000, PAD = 24, GAP = 20
  const inner = W - PAD * 2
  const idSwap = turns % 2 === 1
  const idW = idPhoto ? (idSwap ? idPhoto.height : idPhoto.width) : 0
  const idH = idPhoto ? (idSwap ? idPhoto.width : idPhoto.height) : 0
  const selfieH = selfie ? Math.round(inner * selfie.height / selfie.width) : 0
  const idDrawH = idPhoto ? Math.round(inner * idH / idW) : 0
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = PAD * 2 + selfieH + idDrawH + (selfie && idPhoto ? GAP : 0)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  let y = PAD
  if (selfie) { ctx.drawImage(selfie, PAD, y, inner, selfieH); y += selfieH + GAP }
  if (idPhoto) {
    ctx.save()
    ctx.translate(PAD + inner / 2, y + idDrawH / 2)
    ctx.rotate(turns * Math.PI / 2)
    const w = idSwap ? idDrawH : inner, h = idSwap ? inner : idDrawH
    ctx.drawImage(idPhoto, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
  return canvas
}
const canvasBlob = (canvas, type, q) => new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('image'))), type, q))

export function KycPhotos({ client }) {
  const { id_photo_path: idPath, selfie_path: selfiePath } = client
  const key = `kyc-turns:${idPath}`
  const [photos, setPhotos] = useState(null)
  const [turns, setTurns] = useState(null)
  const [preview, setPreview] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    setPhotos(null); setTurns(null)
    if (!idPath && !selfiePath) return
    Promise.all([loadPrivatePhoto(selfiePath).catch(() => null), loadPrivatePhoto(idPath).catch(() => null)]).then(([selfie, idPhoto]) => {
      if (!live) return
      let saved = null
      try { saved = localStorage.getItem(key) } catch { /* private mode */ }
      // An ID photo taken upright is turned on its side so the card lies horizontally.
      const auto = idPhoto && idPhoto.height > idPhoto.width ? 3 : 0
      setPhotos({ selfie, idPhoto })
      setTurns(saved === null ? auto : Number(saved) % 4)
    })
    return () => { live = false }
  }, [idPath, selfiePath])

  useEffect(() => {
    if (!photos || turns === null || (!photos.selfie && !photos.idPhoto)) return
    let url = null, live = true
    canvasBlob(drawKycSheet(photos.selfie, photos.idPhoto, turns), 'image/jpeg', 0.85).then((b) => {
      if (!live) return
      url = URL.createObjectURL(b); setPreview(url)
    })
    return () => { live = false; if (url) URL.revokeObjectURL(url) }
  }, [photos, turns])

  if (!idPath && !selfiePath) return <div className="flex h-40 items-center justify-center rounded-lg bg-paper text-xs text-ink-faint">No photos</div>
  if (photos && !photos.selfie && !photos.idPhoto) return <div className="flex h-40 items-center justify-center rounded-lg bg-paper text-xs text-ink-faint">Could not load the photos</div>
  if (!preview) return <div className="h-64 animate-pulse rounded-lg bg-paper" />

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2500) }
  function rotate() {
    const next = (turns + 1) % 4
    setTurns(next)
    try { localStorage.setItem(key, String(next)) } catch { /* private mode */ }
  }
  async function copy() {
    setBusy(true)
    const blob = canvasBlob(drawKycSheet(photos.selfie, photos.idPhoto, turns), 'image/png')
    try {
      if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error('unsupported')
      // Safari needs the ClipboardItem created right on the tap, so it gets the promise.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      flash('Copied ✓')
    } catch {
      try {
        const file = new File([await blob], `${client.full_name} - ID.png`, { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
        else {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(file); a.download = file.name; a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 5000)
          flash('Downloaded')
        }
      } catch (e) {
        if (e?.name !== 'AbortError') flash('Could not copy')
      }
    }
    setBusy(false)
  }
  const btn = 'rounded-lg border border-line bg-card px-2 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-60'
  return (
    <div>
      <a href={preview} target="_blank" rel="noreferrer">
        <img src={preview} alt={`Selfie with ID and valid ID of ${client.full_name}`} className="w-full rounded-lg border border-line" />
      </a>
      <div className="mt-1.5 flex gap-2">
        <button type="button" onClick={copy} disabled={busy} className={`flex-1 ${btn}`}>{msg || (busy ? 'Copying…' : 'Copy image')}</button>
        {photos.idPhoto && <button type="button" onClick={rotate} className={btn}>Rotate ID</button>}
      </div>
    </div>
  )
}
