import { Fragment } from 'react'
import { fmtDate } from '../lib/loanMath.js'

function renderInline(line, key) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g)
  return (
    <Fragment key={key}>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p))}
    </Fragment>
  )
}

// Renders contract text (**bold**, blank line = paragraph) + signature block.
export default function ContractView({ text, lenderName, borrowerName, signature, signedAt, signedName }) {
  const paragraphs = (text || '').split(/\n\s*\n/)
  return (
    <div className="print-area rounded-xl border border-line bg-white p-5 text-[14px] leading-relaxed text-ink sm:p-8">
      <h2 className="mb-5 text-center font-serif text-2xl font-semibold tracking-wide">LOAN AGREEMENT</h2>
      <div className="space-y-3.5">
        {paragraphs.map((p, i) => (
          <p key={i}>
            {p.split('\n').map((line, j, arr) => (
              <Fragment key={j}>
                {renderInline(line, j)}
                {j < arr.length - 1 && <br />}
              </Fragment>
            ))}
          </p>
        ))}
      </div>
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <div>
          <div className="h-16" />
          <div className="border-t border-ink pt-1 text-sm">
            <div className="font-semibold">{lenderName}</div>
            <div className="text-ink-faint">Lender</div>
          </div>
        </div>
        <div>
          <div className="flex h-16 items-end">
            {signature && <img src={signature} alt="Borrower signature" className="max-h-16 max-w-full" />}
          </div>
          <div className="border-t border-ink pt-1 text-sm">
            <div className="font-semibold">{signedName || borrowerName}</div>
            <div className="text-ink-faint">
              Borrower{signedAt ? ` · signed electronically ${fmtDate(signedAt.slice(0, 10))} ${new Date(signedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
