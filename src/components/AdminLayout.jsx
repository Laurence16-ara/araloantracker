import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { DataProvider, useData } from '../lib/data.jsx'
import { Button, Card, ErrorNote, Field, Spinner } from './ui.jsx'
import { cx } from '../lib/utils.js'

export default function AdminLayout() {
  const [session, setSession] = useState(undefined)
  const [isAdmin, setIsAdmin] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setIsAdmin(null)
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(!!data))
  }, [session])

  if (session === undefined || (session && isAdmin === null)) return <FullSpinner />
  if (!session) return <Login />
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-sm px-4 py-20 text-center">
        <h1 className="font-serif text-2xl font-semibold">No access</h1>
        <p className="mt-2 text-sm text-ink-soft">{session.user.email} is not an admin account.</p>
        <Button variant="secondary" className="mt-4" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    )
  return (
    <DataProvider>
      <Shell email={session.user.email} />
    </DataProvider>
  )
}

const NAV = [
  ['/admin', 'Dashboard', '◧', true],
  ['/admin/applications', 'Applications', '✎'],
  ['/admin/records', 'Records', '☰'],
  ['/admin/clients', 'Clients', '☺'],
  ['/admin/reports', 'Reports', '▤'],
  ['/admin/settings', 'Settings', '⚙'],
]

function Shell({ email }) {
  const { loading, error, loans, reload } = useData()
  const loc = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  const pendingApps = loans.filter((l) => l.status === 'for_release').length

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print hidden w-60 shrink-0 border-r border-line bg-card lg:block">
        <div className="sticky top-0 flex h-screen flex-col p-4">
          <Brand />
          <nav className="mt-6 space-y-0.5">
            {NAV.map(([to, label, icon, end]) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold', isActive ? 'bg-moss-light text-moss' : 'text-ink-soft hover:bg-paper hover:text-ink')}>
                <span className="w-4 text-center">{icon}</span>
                <span className="flex-1">{label}</span>
                {to.endsWith('applications') && pendingApps > 0 && <span className="rounded-full bg-amber px-1.5 text-[11px] text-white">{pendingApps}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-line pt-3 text-xs text-ink-faint">
            <div className="truncate">{email}</div>
            <button className="mt-1 font-semibold text-ink-soft hover:text-ink" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand />
        <NavLink to="/admin/settings" className="rounded-lg px-2 py-1 text-lg text-ink-soft">⚙</NavLink>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-6xl">
          {error && <div className="mb-4"><ErrorNote>Couldn't load data: {error} <button className="ml-2 underline" onClick={reload}>Retry</button></ErrorNote></div>}
          {loading ? <FullSpinner inline /> : <Outlet />}
        </div>
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.slice(0, 5).map(([to, label, icon, end]) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold', isActive ? 'text-moss' : 'text-ink-faint')}>
            <span className="text-lg leading-none">{icon}</span>
            {label}
            {to.endsWith('applications') && pendingApps > 0 && <span className="absolute right-[22%] top-1 rounded-full bg-amber px-1.5 text-[10px] text-white">{pendingApps}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-moss font-serif text-base font-semibold text-paper">₱</div>
      <div className="leading-tight">
        <div className="text-sm font-bold">Ara Loan Tracker</div>
        <div className="text-[11px] text-ink-faint">Admin</div>
      </div>
    </div>
  )
}

function FullSpinner({ inline }) {
  return <div className={cx('flex items-center justify-center text-moss', inline ? 'py-24' : 'min-h-screen')}><Spinner className="h-7 w-7" /></div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(() => {
    // Supabase sends errors back in the URL after Google sign-in
    const q = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
    const d = q.get('error_description')
    if (!d) return null
    return /signups not allowed|not allowed/i.test(d) ? 'This Google account has no access.' : d.replace(/\+/g, ' ')
  })
  const [busy, setBusy] = useState(null)
  const [showEmail, setShowEmail] = useState(false)

  async function google() {
    setBusy('google'); setErr(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin`, queryParams: { prompt: 'select_account' } },
    })
    if (error) { setErr(error.message); setBusy(null) }
  }
  async function submit(e) {
    e.preventDefault()
    setBusy('email'); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(null)
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <Brand />
        <h1 className="mt-6 font-serif text-2xl font-semibold">Sign in</h1>
        <button onClick={google} disabled={!!busy}
          className="mt-5 flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm font-semibold text-ink shadow-card transition hover:bg-paper disabled:opacity-60">
          {busy === 'google' ? <Spinner className="h-4 w-4" /> : <GoogleIcon />}
          Continue with Google
        </button>
        <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>
        {showEmail ? (
          <form onSubmit={submit} className="mt-4 space-y-3 border-t border-line pt-4">
            <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
            <Field label="Password"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
            <Button className="w-full" variant="secondary" loading={busy === 'email'}>Sign in with email</Button>
          </form>
        ) : (
          <button className="mt-4 w-full text-center text-xs font-semibold text-ink-faint hover:text-ink-soft" onClick={() => setShowEmail(true)}>
            Use email and password instead
          </button>
        )}
      </Card>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  )
}
