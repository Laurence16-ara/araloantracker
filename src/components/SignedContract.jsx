import { useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import ContractView from './ContractView.jsx'
import { Button } from './ui.jsx'
import { schedulePlan, peso, fmtDate, SCHEDULES } from '../lib/loanMath.js'

// Signed contract + buttons to send it on Messenger (image), copy the text, or print/save PDF.
export default function SignedContract({ loan, client, settings }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileBase = `Loan Agreement #${loan.loan_no} - ${client.full_name}`
  const plan = loan.release_date ? schedulePlan(loan) : []
  const showPlan = plan.length > 0 && /as set by the Lender/.test(loan.contract_text || '')
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(null), 2500) }

  async function shareImage() {
    setBusy(true)
    try {
      const blob = await toBlob(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
      const file = new File([blob], `${fileBase}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileBase })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = file.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
        flash('Image downloaded. Attach it in Messenger.')
      }
    } catch (e) {
      if (e?.name !== 'AbortError') flash('Could not make the image. Try Print / Save PDF.')
    } finally {
      setBusy(false)
    }
  }

  async function copyText() {
    const signed = loan.signed_at
      ? `\n\nSigned electronically by ${loan.signed_name || client.full_name} on ${new Date(loan.signed_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.`
      : ''
    const sched = showPlan ? `\n\nPAYMENT SCHEDULE (${SCHEDULES[loan.schedule]?.label})\n` + plan.map((x) => `${fmtDate(x.due)}: ${peso(x.amount)}`).join('\n') : ''
    const text = `LOAN AGREEMENT\n\n${(loan.contract_text || '').replace(/\*\*/g, '')}${signed}\n\nLender: ${settings.lender_name}\nBorrower: ${client.full_name}${sched}`
    try {
      await navigator.clipboard.writeText(text)
      flash('Contract text copied. Paste it in Messenger.')
    } catch {
      window.prompt('Copy the contract:', text)
    }
  }

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={shareImage} loading={busy}>Share / Download image</Button>
        <Button size="sm" variant="secondary" onClick={copyText}>Copy text</Button>
        <Button size="sm" variant="secondary" onClick={() => printContract(loan, settings, client)}>Print / Save PDF</Button>
        {msg && <span className="text-xs font-semibold text-moss">{msg}</span>}
      </div>
      <div ref={ref}>
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
    </div>
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
