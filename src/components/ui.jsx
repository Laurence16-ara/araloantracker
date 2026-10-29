import { useEffect } from 'react'
import { cx } from '../lib/utils.js'

export function Button({ variant = 'primary', size = 'md', className, loading, children, ...p }) {
  const v = {
    primary: 'bg-moss text-white hover:bg-moss-dark',
    secondary: 'bg-card text-ink border border-line hover:bg-paper',
    ghost: 'text-ink-soft hover:bg-line/50',
    danger: 'bg-card text-rust border border-rust/30 hover:bg-rust-light',
  }[variant]
  const s = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-[15px]' }[size]
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:pointer-events-none', v, s, className)}
      disabled={loading || p.disabled}
      {...p}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <span className={cx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}

export function Card({ className, children, ...p }) {
  return <div className={cx('rounded-xl border border-line bg-card shadow-card', className)} {...p}>{children}</div>
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-rust">{error}</span>}
    </label>
  )
}

const BADGE = {
  paid: ['Paid', 'bg-moss-light text-moss'],
  paid_late: ['Paid late', 'bg-moss-light text-moss'],
  active: ['Active', 'bg-amber-light text-amber'],
  partial: ['Partial', 'bg-amber-light text-amber'],
  upcoming: ['Upcoming', 'bg-line/60 text-ink-soft'],
  due_today: ['Due today', 'bg-amber-light text-amber'],
  overdue: ['Overdue', 'bg-rust-light text-rust'],
  awaiting_signature: ['Waiting for signature', 'bg-line/60 text-ink-soft'],
  for_release: ['Signed · to release', 'bg-amber-light text-amber'],
  rejected: ['Rejected', 'bg-line/60 text-ink-faint'],
  cancelled: ['Cancelled', 'bg-line/60 text-ink-faint'],
  pending: ['New · pending', 'bg-amber-light text-amber'],
  approved: ['Approved', 'bg-moss-light text-moss'],
  blocked: ['Blocked', 'bg-rust-light text-rust'],
}
export function Badge({ status, children }) {
  const [label, cls] = BADGE[status] || [status, 'bg-line text-ink-soft']
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', cls)}>{children || label}</span>
}

export function Stat({ label, value, sub, tone }) {
  const t = { rust: 'text-rust', moss: 'text-moss', amber: 'text-amber' }[tone] || 'text-ink'
  return (
    <Card className="p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cx('mt-1 font-serif text-2xl font-semibold num', t)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
    </Card>
  )
}

export function PageHeader({ title, sub, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-[28px] font-semibold leading-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-paper" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ children }) {
  return <div className="px-4 py-10 text-center text-sm text-ink-faint">{children}</div>
}

export function ErrorNote({ children }) {
  if (!children) return null
  return <div className="rounded-lg border border-rust/30 bg-rust-light px-3 py-2 text-sm text-rust">{children}</div>
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-paper p-0.5">
      {options.map(([v, l]) => (
        <button
          type="button"
          key={v}
          onClick={() => onChange(v)}
          className={cx('rounded-md px-3 py-1.5 text-[13px] font-semibold transition', value === v ? 'bg-card text-ink shadow-card' : 'text-ink-soft hover:text-ink')}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
