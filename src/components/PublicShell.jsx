export default function PublicShell({ lender, children }) {
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-line bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-moss font-serif text-lg font-semibold text-paper">₱</div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold">{lender || 'Loan Services'}</div>
            <div className="text-xs text-ink-faint">Personal loans · Santa Rosa, Laguna</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 pb-16">{children}</main>
    </div>
  )
}
