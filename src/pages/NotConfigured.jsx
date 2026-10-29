export default function NotConfigured() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-serif text-2xl font-semibold">Almost there</h1>
      <p className="mt-2 text-ink-soft">
        The app isn't connected to the database yet. Add <code className="rounded bg-line px-1">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-line px-1">VITE_SUPABASE_ANON_KEY</code> in Vercel → Project → Settings → Environment Variables, then redeploy.
      </p>
    </div>
  )
}
