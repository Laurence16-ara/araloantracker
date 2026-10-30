import { useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import ContractView from './ContractView.jsx'
import { Button } from './ui.jsx'
import { schedulePlan, peso, fmtDate, SCHEDULES } from '../lib/loanMath.js'

const IMG_OPTS = { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true }

// Copies a PNG to the clipboard. The ClipboardItem gets a promise right away
// (inside the click) so it also works on iPhone Safari.
async function copyPng(makeBlob) {
  if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error('unsupported')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': makeBlob() })])
}

// The contract exactly as it appears in the image (contract + payment schedule when set later).
function ContractSheet({ loan, client, settings, sheetRef }) {
  const plan = loan.release_date ? schedulePlan(loan) : []
  const showPlan = plan.length > 0 && /as set by the Lender/.test(loan.contract_text || '')
  return (
    <div ref={sheetRef} className="bg-white">
      <ContractView
        text={loan.contract_text}
        lenderName={settings.lender_name}
        lenderSignature={settings.lender_signature}
        borrowerName={client.full_name}
        signature={loan.signature}
        signedAt={loan.signed_at}
        signedName={loan.signed_name}
      />
      {showPlan && (
        <div className="mt-3 rounded-xl border border-line bg-white p-5 text-[14px]">
          <div className="font-bold">Payment schedule ({SCHEDULES[loan.schedule]?.label}) · released {fmtDate(loan.release_date)}</div>
          {plan.map((x) => (
            <div key={x.n} className="mt-1 flex justify-between border-b border-line py-1 last:border-0">
              <span>{fmtDate(x.due, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</span>
              <b className="num">{peso(x.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function useContractImage(loan, client) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const fileBase = `Loan Agreement #${loan.loan_no} - ${client.full_name}`
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(null), 2500) }
  const makeBlob = () => toBlob(ref.current, IMG_OPTS)

  const download = (blob) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${fileBase}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  async function copyImage() {
    setBusy('copy')
    try {
      await copyPng(makeBlob)
      flash('Contract image copied. Paste it in Messenger.')
    } catch {
      try { download(await makeBlob()); flash("Copy isn't supported here, so the image was downloaded instead.") }
      catch { flash('Could not make the image.') }
    } finally {
      setBusy(null)
    }
  }

  async function shareImage() {
    setBusy('share')
    try {
      const blob = await makeBlob()
      const file = new File([blob], `${fileBase}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: fileBase })
      else { download(blob); flash('Image downloaded. Attach it in Messenger.') }
    } catch (e) {
      if (e?.name !== 'AbortError') flash('Could not make the image. Try Print / Save PDF.')
    } finally {
      setBusy(null)
    }
  }
  return { ref, busy, msg, copyImage, shareImage }
}

// Full contract view with buttons (used in the contract window).
export default function SignedContract({ loan, client, settings }) {
  const { ref, busy, msg, copyImage, shareImage } = useContractImage(loan, client)
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={copyImage} loading={busy === 'copy'}>Copy image</Button>
        <Button size="sm" variant="secondary" onClick={shareImage} loading={busy === 'share'}>Share / Download</Button>
        <Button size="sm" variant="secondary" onClick={() => printContract(loan, settings, client)}>Print / Save PDF</Button>
        {msg && <span className="text-xs font-semibold text-moss">{msg}</span>}
      </div>
      <ContractSheet loan={loan} client={client} settings={settings} sheetRef={ref} />
    </div>
  )
}

// One-tap button for cards: renders the contract off-screen and copies it as an image.
export function CopyContractImageButton({ loan, client, settings, size = 'sm', variant = 'secondary' }) {
  const { ref, busy, msg, copyImage } = useContractImage(loan, client)
  if (!loan.contract_text) return null
  return (
    <>
      <Button size={size} variant={variant} onClick={copyImage} loading={busy === 'copy'}>Copy contract image</Button>
      {msg && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-paper shadow-lg lg:bottom-6">{msg}</div>}
      <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 720, pointerEvents: 'none' }}>
        <ContractSheet loan={loan} client={client} settings={settings} sheetRef={ref} />
      </div>
    </>
  )
}

export function printContract(loan, settings, c) {
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
