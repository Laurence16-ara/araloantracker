import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useData } from '../../lib/data.jsx'
import { exportBackup } from '../../lib/exports.js'
import { DEFAULT_TEMPLATE, buildContractText } from '../../lib/contract.js'
import { Button, Card, ErrorNote, Field, Modal, PageHeader } from '../../components/ui.jsx'
import ContractView from '../../components/ContractView.jsx'
import SignaturePad from '../../components/SignaturePad.jsx'

const PLACEHOLDERS = ['agreement_date', 'lender_name', 'lender_address', 'borrower_name', 'borrower_address', 'borrower_phone', 'principal', 'release_date', 'due_date', 'total', 'payment_terms', 'interest', 'interest_rate', 'penalty_rate', 'penalty_example']

export default function Settings() {
  const data = useData()
  const { settings, reload } = data
  const [f, setF] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [preview, setPreview] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setF({ ...settings, contract_template: settings.contract_template || DEFAULT_TEMPLATE }) }, [settings])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const applyLink = `${window.location.origin}/apply`

  async function save() {
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.from('settings').update({
      lender_name: f.lender_name, lender_address: f.lender_address,
      default_rate: Number(f.default_rate), penalty_rate: Number(f.penalty_rate),
      min_amount: Number(f.min_amount), max_amount: Number(f.max_amount), apply_open: f.apply_open,
      contract_template: f.contract_template.trim() === DEFAULT_TEMPLATE.trim() ? null : f.contract_template,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    setBusy(false)
    if (error) return setErr(error.message)
    setMsg('Saved.')
    reload()
  }

  const sampleText = buildContractText({
    loan: { principal: 10000, interest: 2000, interest_rate: f.default_rate, schedule: 'weekly', release_date: data.today },
    client: { full_name: 'Juan Dela Cruz', address: 'Santa Rosa, Laguna', phone: '09171234567' },
    settings: f,
  })

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Lender & rates</h2>
          <Field label="Lender name"><input className="input" value={f.lender_name || ''} onChange={set('lender_name')} /></Field>
          <Field label="Lender address"><input className="input" value={f.lender_address || ''} onChange={set('lender_address')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default interest (% per month)"><input className="input num" value={f.default_rate ?? ''} onChange={set('default_rate')} /></Field>
            <Field label="Late penalty (% per day)"><input className="input num" value={f.penalty_rate ?? ''} onChange={set('penalty_rate')} /></Field>
            <Field label="Online min amount"><input className="input num" value={f.min_amount ?? ''} onChange={set('min_amount')} /></Field>
            <Field label="Online max amount"><input className="input num" value={f.max_amount ?? ''} onChange={set('max_amount')} /></Field>
          </div>
        </Card>
        <LenderSignature current={settings.lender_signature} name={settings.lender_name} onSaved={reload} />
        </div>

        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Online application page</h2>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-moss" checked={!!f.apply_open} onChange={set('apply_open')} />
              <span>Accept new applications</span>
            </label>
            <div className="break-all rounded-lg bg-paper px-3 py-2 text-sm">{applyLink}</div>
            <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(applyLink).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Backup</h2>
            <p className="text-sm text-ink-soft">Downloads all loans, payments and clients as one Excel file. Do this once a week and keep it in Google Drive.</p>
            <Button size="sm" onClick={() => exportBackup(data)}>Download backup (Excel)</Button>
          </Card>
        </div>

        <Card className="space-y-3 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Contract text</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPreview(true)}>Preview</Button>
              <Button size="sm" variant="ghost" onClick={() => confirm('Reset the contract to the original text?') && setF({ ...f, contract_template: DEFAULT_TEMPLATE })}>Reset</Button>
            </div>
          </div>
          <p className="text-xs text-ink-faint">
            <b>**text**</b> = bold. Blank line = new paragraph. These are filled in automatically:{' '}
            {PLACEHOLDERS.map((p) => <code key={p} className="mr-1 rounded bg-paper px-1">{`{{${p}}}`}</code>)}
          </p>
          <textarea className="input font-mono !text-[13px] leading-relaxed" rows={22} value={f.contract_template || ''} onChange={set('contract_template')} />
          <p className="text-xs text-ink-faint">Changes only apply to new contracts. Contracts already signed keep their original text.</p>
        </Card>
      </div>

      <div className="sticky bottom-20 mt-5 flex items-center justify-end gap-3 lg:bottom-4">
        {msg && <span className="text-sm font-semibold text-moss">{msg}</span>}
        <ErrorNote>{err}</ErrorNote>
        <Button size="lg" onClick={save} loading={busy}>Save settings</Button>
      </div>

      <Modal open={preview} onClose={() => setPreview(false)} title="Contract preview (sample loan)" wide>
        <ContractView text={sampleText} lenderName={f.lender_name} lenderSignature={settings.lender_signature} borrowerName="Juan Dela Cruz" />
      </Modal>
    </>
  )
}

function LenderSignature({ current, name, onSaved }) {
  const [editing, setEditing] = useState(!current)
  const [sig, setSig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  async function save(value) {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('settings').update({ lender_signature: value, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    if (error) return setErr(error.message)
    setEditing(false); setSig(null)
    onSaved()
  }
  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-semibold">Lender signature</h2>
        <p className="text-sm text-ink-soft">Sign once. It appears on the lender line of every contract{name ? `, above "${name}"` : ''}.</p>
      </div>
      {!editing && current ? (
        <>
          <div className="flex h-24 items-center justify-center rounded-xl border border-line bg-white p-2">
            <img src={current} alt="Lender signature" className="max-h-20 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Sign again</Button>
            <Button size="sm" variant="ghost" loading={busy} onClick={() => confirm('Remove the lender signature from contracts?') && save(null)}>Remove</Button>
          </div>
        </>
      ) : (
        <>
          <SignaturePad onChange={setSig} />
          <div className="flex gap-2">
            <Button size="sm" disabled={!sig} loading={busy} onClick={() => save(sig)}>Save signature</Button>
            {current && <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </>
      )}
      <ErrorNote>{err}</ErrorNote>
    </Card>
  )
}
