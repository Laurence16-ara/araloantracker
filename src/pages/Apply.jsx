import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { peso, interestFor, round2 } from '../lib/loanMath.js'
import { PAYOUT_METHODS } from '../lib/payout.js'
import { buildContractText } from '../lib/contract.js'
import { compressImage, normalizePhone, validPhone, uuid, cx } from '../lib/utils.js'
import PublicShell from '../components/PublicShell.jsx'
import SignaturePad from '../components/SignaturePad.jsx'
import ContractView from '../components/ContractView.jsx'
import { Button, Card, ErrorNote, Field, Spinner } from '../components/ui.jsx'

const ID_TYPES = [
  'PhilSys National ID', "Driver's License", 'UMID', 'SSS ID', 'Passport', 'PRC ID',
  'Postal ID', "Voter's ID", 'PhilHealth ID', 'TIN ID', 'Other government ID',
]
const STEPS = ['Your details', 'Valid ID', 'Loan', 'Contract']

export default function Apply() {
  const [settings, setSettings] = useState(null)
  const [loadErr, setLoadErr] = useState(null)
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ full_name: '', phone: '', address: '', id_type: ID_TYPES[0], principal: '', payout_method: 'gcash', payout_other: '', use_my_number: true, payout_account: '' })
  const [idFile, setIdFile] = useState(null)
  const [selfieFile, setSelfieFile] = useState(null)
  const [signature, setSignature] = useState(null)
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    supabase.rpc('public_settings').then(({ data, error }) => (error ? setLoadErr(error.message) : setSettings(data)))
  }, [])

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const amount = Number(f.principal) || 0
  const loan = useMemo(() => {
    const rate = settings?.default_rate ?? 20
    return { principal: amount, interest_rate: rate, interest: interestFor(amount, rate), schedule: null, release_date: null }
  }, [amount, settings])
  const contractText = useMemo(
    () => (settings ? buildContractText({ loan, client: { ...f, phone: normalizePhone(f.phone) }, settings }) : ''),
    [loan, f, settings],
  )

  const payoutNumber = f.use_my_number ? normalizePhone(f.phone) : normalizePhone(f.payout_account)

  function validate(s) {
    const e = {}
    if (s === 0) {
      if (f.full_name.trim().split(/\s+/).length < 2) e.full_name = 'Please enter your full name (first and last name).'
      if (!validPhone(f.phone)) e.phone = 'Enter an 11-digit mobile number, e.g. 09171234567.'
      if (f.address.trim().length < 8) e.address = 'Please enter your complete address.'
    }
    if (s === 1) {
      if (!idFile) e.id = 'Please upload a photo of your valid ID.'
      if (!selfieFile) e.selfie = 'Please upload a selfie holding your ID.'
    }
    if (s === 2) {
      if (amount < settings.min_amount || amount > settings.max_amount)
        e.principal = `Amount must be between ${peso(settings.min_amount)} and ${peso(settings.max_amount)}.`
      if (f.payout_method === 'other' && f.payout_other.trim().length < 2) e.payout_other = 'Please type the name of your e-wallet.'
      if (!f.use_my_number && !validPhone(f.payout_account)) e.payout_account = 'Enter the 11-digit number of your account, e.g. 09171234567.'
    }
    if (s === 3) {
      if (!agree) e.agree = 'Please confirm that you agree to the contract.'
      if (!signature) e.signature = 'Please sign above.'
    }
    setErrors(e)
    return !Object.keys(e).length
  }
  const next = () => {
    if (!validate(step)) return
    setStep((s) => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    if (!validate(3)) return
    setSubmitting(true)
    setSubmitErr(null)
    try {
      const key = uuid()
      const up = async (file, name) => {
        const blob = await compressImage(file)
        const path = `applications/${key}-${name}.jpg`
        const { error } = await supabase.storage.from('kyc').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw new Error('Photo upload failed: ' + error.message)
        return path
      }
      const id_photo_path = await up(idFile, 'id')
      const selfie_path = await up(selfieFile, 'selfie')
      const { data, error } = await supabase.rpc('submit_application', {
        p: { full_name: f.full_name, address: f.address, id_type: f.id_type, phone: normalizePhone(f.phone), principal: amount, payout_method: f.payout_method, payout_other: f.payout_method === 'other' ? f.payout_other.trim() : null, payout_account: payoutNumber, id_photo_path, selfie_path, signature, contract_text: contractText },
      })
      if (error) throw error
      setDone(data)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setSubmitErr(e.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadErr) return <PublicShell><ErrorNote>Could not load the form. Please refresh the page.</ErrorNote></PublicShell>
  if (!settings) return <PublicShell><div className="flex justify-center py-20 text-moss"><Spinner /></div></PublicShell>
  if (!settings.apply_open)
    return (
      <PublicShell lender={settings.lender_name}>
        <Card className="p-6 text-center">
          <h1 className="font-serif text-2xl font-semibold">Applications are closed</h1>
          <p className="mt-2 text-ink-soft">We're not accepting new applications right now. Please message us for details.</p>
        </Card>
      </PublicShell>
    )
  if (done)
    return (
      <PublicShell lender={settings.lender_name}>
        <Card className="p-6 text-center sm:p-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-moss-light text-2xl text-moss">✓</div>
          <h1 className="font-serif text-2xl font-semibold">Application sent</h1>
          <p className="mt-2 text-ink-soft">
            Thank you, {f.full_name.split(' ')[0]}! We'll review your application and message you once it's approved.
          </p>
          <div className="mt-5 inline-block rounded-lg bg-paper px-4 py-2 text-sm">
            Reference no. <span className="font-bold num">#{done.loan_no}</span>
          </div>
        </Card>
      </PublicShell>
    )

  const total = round2(loan.principal + loan.interest)
  const dailyPenalty = round2((total * Number(settings.penalty_rate)) / 100)
  return (
    <PublicShell lender={settings.lender_name}>
      <h1 className="font-serif text-[28px] font-semibold leading-tight">Loan application</h1>
      <p className="mt-1 text-sm text-ink-soft">For new clients. Takes about 5 minutes. Have your valid ID ready.</p>

      <ol className="my-5 grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s}>
            <div className={cx('h-1.5 rounded-full', i <= step ? 'bg-moss' : 'bg-line')} />
            <div className={cx('mt-1.5 text-[11px] font-semibold', i === step ? 'text-ink' : 'text-ink-faint')}>{s}</div>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="space-y-4 p-5">
          <Field label="Full name" hint="As shown on your valid ID" error={errors.full_name}>
            <input className="input" value={f.full_name} onChange={set('full_name')} autoComplete="name" />
          </Field>
          <Field label="Mobile number" error={errors.phone}>
            <input className="input" value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="09XXXXXXXXX" autoComplete="tel" />
          </Field>
          <Field label="Complete address" error={errors.address}>
            <textarea className="input" rows={2} value={f.address} onChange={set('address')} placeholder="House no., street, barangay, city" />
          </Field>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-5 p-5">
          <Field label="Type of ID">
            <select className="input" value={f.id_type} onChange={set('id_type')}>
              {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <PhotoInput label="Photo of your valid ID" hint="Front side, clear and readable, all corners visible" file={idFile} onFile={setIdFile} error={errors.id} />
          <PhotoInput label="Selfie holding your ID" hint="Your face and the ID must both be clear" file={selfieFile} onFile={setSelfieFile} error={errors.selfie} />
          <p className="text-xs text-ink-faint">Your photos are stored privately and only seen by the lender for verification.</p>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-5 p-5">
          <Field label="How much do you want to borrow?" error={errors.principal}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-ink-soft">₱</span>
              <input className="input pl-7 text-lg font-semibold num" inputMode="numeric" value={f.principal}
                onChange={(e) => setF((s) => ({ ...s, principal: e.target.value.replace(/\D/g, '') }))} placeholder="0" />
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {[2000, 5000, 10000, 20000, 30000].filter((v) => v >= settings.min_amount && v <= settings.max_amount).map((v) => (
              <button key={v} type="button" onClick={() => setF((s) => ({ ...s, principal: String(v) }))}
                className={cx('rounded-full border px-3 py-1 text-[13px] font-semibold', amount === v ? 'border-moss bg-moss-light text-moss' : 'border-line text-ink-soft')}>
                {peso(v)}
              </button>
            ))}
          </div>

          <div>
            <span className="label">Where should we send your loan?</span>
            <div className="grid grid-cols-2 gap-2">
              {PAYOUT_METHODS.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setF((x) => ({ ...x, payout_method: k }))}
                  className={cx('rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition', f.payout_method === k ? 'border-moss bg-moss-light/50 text-moss' : 'border-line bg-white text-ink')}>
                  {label}
                </button>
              ))}
            </div>
            {f.payout_method === 'other' && (
              <Field label="Name of e-wallet" error={errors.payout_other} className="mt-3">
                <input className="input" value={f.payout_other} onChange={set('payout_other')} placeholder="e.g. ShopeePay, GoTyme" />
              </Field>
            )}
            <label className="mt-3 flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-moss" checked={f.use_my_number}
                onChange={(e) => setF((x) => ({ ...x, use_my_number: e.target.checked }))} />
              <span>Use my mobile number <b className="num">{normalizePhone(f.phone)}</b></span>
            </label>
            {!f.use_my_number && (
              <Field label="Account number" error={errors.payout_account} className="mt-3">
                <input className="input num" inputMode="tel" value={f.payout_account} onChange={set('payout_account')} placeholder="09XXXXXXXXX" />
              </Field>
            )}
          </div>

          {amount > 0 && (
            <div className="rounded-xl bg-paper p-4 text-sm">
              <Row k="Loan amount" v={peso(loan.principal)} />
              <Row k={`Interest (${loan.interest_rate}% for 1 month)`} v={peso(loan.interest)} />
              <div className="my-2 border-t border-line" />
              <Row k="Total to pay within 1 month" v={peso(total)} bold />
              <p className="mt-2 text-xs text-ink-soft">The payment schedule (one payment, every 15 days, or weekly) will be set by the lender when your loan is approved.</p>
            </div>
          )}
          {amount > 0 && (
            <div className="rounded-xl border border-rust/25 bg-rust-light p-4 text-sm">
              <div className="font-semibold text-rust">If you pay late</div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-ink-soft">Penalty per day if the full {peso(total)} is unpaid</span>
                <span className="text-lg font-bold text-rust num">{peso(dailyPenalty)}/day</span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">That is {settings.penalty_rate}% of the unpaid amount for every day of delay, until fully paid.</p>
            </div>
          )}
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">Please read the contract carefully, then sign below.</p>
          <ContractView text={contractText} lenderName={settings.lender_name} borrowerName={f.full_name} />
          <Card className="space-y-4 p-5">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-moss" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I, <strong>{f.full_name}</strong>, have read and agree to this Loan Agreement, and confirm that the information and ID I gave are true.</span>
            </label>
            {errors.agree && <ErrorNote>{errors.agree}</ErrorNote>}
            <div>
              <span className="label">Your signature</span>
              <SignaturePad onChange={setSignature} />
              {errors.signature && <p className="text-xs font-medium text-rust">{errors.signature}</p>}
            </div>
            <ErrorNote>{submitErr}</ErrorNote>
          </Card>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        {step > 0 && (
          <Button variant="secondary" size="lg" onClick={() => setStep((s) => s - 1)} disabled={submitting}>Back</Button>
        )}
        {step < 3 ? (
          <Button size="lg" className="flex-1" onClick={next}>Continue</Button>
        ) : (
          <Button size="lg" className="flex-1" onClick={submit} loading={submitting}>Sign and submit</Button>
        )}
      </div>
    </PublicShell>
  )
}

function Row({ k, v, bold }) {
  return (
    <div className={cx('flex justify-between py-0.5', bold && 'text-base font-bold')}>
      <span className={bold ? '' : 'text-ink-soft'}>{k}</span>
      <span className="num">{v}</span>
    </div>
  )
}

function PhotoInput({ label, hint, file, onFile, error, capture }) {
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!file) return setPreview(null)
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div>
      <span className="label">{label}</span>
      <label className={cx('flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed bg-white p-3', error ? 'border-rust/50' : 'border-line')}>
        {preview ? (
          <img src={preview} alt="" className="h-20 w-28 rounded-lg object-cover" />
        ) : (
          <div className="flex h-20 w-28 items-center justify-center rounded-lg bg-paper text-2xl text-ink-faint">📷</div>
        )}
        <div className="text-sm">
          <div className="font-semibold text-moss">{file ? 'Change photo' : 'Take or upload photo'}</div>
          <div className="text-xs text-ink-faint">{hint}</div>
        </div>
        <input type="file" accept="image/*" capture={capture} className="hidden" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      </label>
      {error && <p className="mt-1 text-xs font-medium text-rust">{error}</p>}
    </div>
  )
}
