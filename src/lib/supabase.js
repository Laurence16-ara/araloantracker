import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)
export const supabase = isConfigured ? createClient(url, key) : null

// Supabase returns max 1000 rows per request — page through everything.
export async function fetchAll(table, select = '*', order = 'created_at') {
  const size = 1000
  let from = 0
  let all = []
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).order(order, { ascending: true }).range(from, from + size - 1)
    if (error) throw error
    all = all.concat(data)
    if (data.length < size) return all
    from += size
  }
}
