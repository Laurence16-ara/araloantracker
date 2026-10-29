import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { peso, schedulePlan, fmtDate, round2, SCHEDULES } from '../lib/loanMath.js'
import { buildContractText } from '../lib/contract.js'
import { normalizePhone, validPhone } from '../lib/utils.js'
import PublicShell from '../components/PublicShell.jsx'
import SignaturePad from '../components/SignaturePad.jsx'
import ContractView from '../components/ContractView.jsx'
import { Button, Card, ErrorNote, Field, Spinner } from '../components/ui.jsx'

const MESSAGES = {
  not_found: ['Link not found', 'This signing link is not valid. Please ask for a new one.'],
  already_signed: ['Already signed', 'This contract has already been signed. Thank you!'],
  expired: ['Link expired', 'This signing link has expired. Please ask for a new one.'],
}

export default function Sign() {
  const { token } = useParams()
  const [req, setReq] = useState(null)
  const [err, setErr] = useState(null)
  const [signature, setSignature] = useState(null)
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [done, setDone] = useState(false)
  const [extra, setExtra] = useState({ address: '', phone: '' })

  useEffect(() => {
    supabase.rpc('get_sign_request', { p_token: token }).then(({ data, error }) => {
      if (error) setErr(['Something went wrong', 'Please refresh the page.'])
      else if (data.error) setErr(MESSAGES[data.error])
      else setReq(data)
    })
  }, [token])

  const text = useMemo(() => {
    if (!req) return ''
    return buildContractText({
      loan: req,
      client: { full_name: req.borrower_name, address: req.borrower_address || extra.address, phone: req.borrower_phone || normalizePhone(extra.phone) },
      settings: req,
    })
  }, [req, extra])

  async function submit() {
    setSaveErr(null)
    if (!agree) return setSaveErr('Please confirm that you agree to the contract.')
    if (!signature) return setSaveErr('Please sign in the box.')
    if (name.trim().length < 3) return setSaveErr('Please type your full name.')
    if (!req.borrower_address && extra.address.trim().length < 8) return setSaveErr('Please enter your complete address.')
    if (!req.borrower_phone && !validPhone(extra.phone)) return setSaveErr('Please enter your 11-digit mobile number.')
    setSaving(true)
    const { error } = await supabase.rpc('sign_loan', { p_token: token, p_signature: signature, p_signed_name: name, p_contract_text: text, p_address: extra.address || null, p_phone: normalizePhone(extra.phone) || null })
    setSaving(false)
    if (error) return setSaveErr(error.message)
    setDone(true)
    window.scrollTo({ top: 0 })
  }

  if (err)
    return (
      <PublicShell>
        <Card className="p-6 text-center">
          <h1 className="font-serif text-2xl font-semibold">{err[0]}</h1>
          <p className="mt-2 text-ink-soft">{err[1]}</p>
        </Card>
      </PublicShell>
    )
  if (!req) return <PublicShell><div className="flex justify-center py-20 text-moss"><Spinner /></div></PublicShell>
  if (done)
    return (
      <PublicShell lender={req.lender_name}>
        <Card className="p-6 text-center sm:p-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-moss-light text-2xl text-moss">✓</div>
          <h1 className="font-serif text-2xl font-semibold">Contract signed</h1>
          <p className="mt-2 text-ink-soft">Thank you, {req.borrower_name.split(' ')[0]}! Your loan will be released shortly.</p>
        </Card>
      </PublicShell>
    )

  const total = round2(Number(req.principal) + Number(req.interest))
  const plan = schedulePlan(req)
  return (
    <PublicShell lender={req.lender_name}>
      <h1 className="font-serif text-[28px] font-semibold leading-tight">Sign your loan contract</h1>
      <p className="mt-1 text-sm text-ink-soft">Hi {req.borrower_name.split(' ')[0]}, please check the details and sign below.</p>

      <Card className="my-4 p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xs text-ink-faint">Loan</div><div className="font-bold num">{peso(req.principal)}</div></div>
          <div><div className="text-xs text-ink-faint">Interest</div><div className="font-bold num">{peso(req.interest)}</div></div>
          <div><div className="text-xs text-ink-faint">Total</div><div className="font-bold text-moss num">{peso(total)}</div></div>
        </div>
        <div className="mt-3 border-t border-line pt-3 text-sm">
          <div className="mb-1 font-semibold">{SCHEDULES[req.schedule].label} payments</div>
          {plan.length ? plan.map((p) => (
            <div key={p.n} className="flex justify-between text-ink-soft"><span>{fmtDate(p.due, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="num font-semibold text-ink">{peso(p.amount)}</span></div>
          )) : <div className="text-ink-soft">Dates start from the release date.</div>}
        </div>
      </Card>

      {(!req.borrower_address || !req.borrower_phone) && (
        <Card className="mb-4 space-y-3 p-4">
          <div className="text-sm font-semibold">Please complete your details for the contract</div>
          {!req.borrower_address && <Field label="Complete address"><input className="input" value={extra.address} onChange={(e) => setExtra({ ...extra, address: e.target.value })} placeholder="House no., street, barangay, city" /></Field>}
          {!req.borrower_phone && <Field label="Mobile number"><input className="input" inputMode="tel" value={extra.phone} onChange={(e) => setExtra({ ...extra, phone: e.target.value })} placeholder="09XXXXXXXXX" /></Field>}
        </Card>
      )}

      <ContractView text={text} lenderName={req.lender_name} borrowerName={req.borrower_name} />

      <Card className="mt-4 space-y-4 p-5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-moss" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I have read and agree to this Loan Agreement.</span>
        </label>
        <Field label="Type your full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={req.borrower_name} />
        </Field>
        <div>
          <span className="label">Your signature</span>
          <SignaturePad onChange={setSignature} />
        </div>
        <ErrorNote>{saveErr}</ErrorNote>
        <Button size="lg" className="w-full" onClick={submit} loading={saving}>Sign contract</Button>
      </Card>
    </PublicShell>
  )
}
