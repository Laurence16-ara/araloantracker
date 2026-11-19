import { round2, todayPH } from './loanMath.js'

export const DEFAULT_TIERS = [{ max: 100, fee: 5 }, { max: 499, fee: 10 }, { max: 1000, fee: 15 }]

// GCash Business fee for one transaction.
// Each tier covers amounts up to its "max". Above the last tier the amount is split into chunks of
// the last tier's max, e.g. with 1,000 → ₱15: 1,500 = 1,000 + 500 = ₱15 + ₱15 = ₱30.
export function gcashFee(amount, tiers = DEFAULT_TIERS) {
  const a = Number(amount) || 0
  const t = (tiers || []).filter((x) => Number(x.max) > 0).map((x) => ({ max: Number(x.max), fee: Number(x.fee) || 0 })).sort((x, y) => x.max - y.max)
  if (a <= 0 || !t.length) return 0
  const top = t[t.length - 1]
  const chunks = Math.floor(a / top.max)
  const rest = round2(a - chunks * top.max)
  const restFee = rest > 0 ? (t.find((x) => rest <= x.max) || top).fee : 0
  return round2(chunks * top.fee + restFee)
}

export const monthOf = (iso) => iso.slice(0, 7)
export function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
export function monthEnd(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
export function monthName(key, long = true) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
}
export function monthsBetween(from, to) {
  const out = []
  for (let k = from; k <= to && out.length < 120; k = shiftMonth(k, 1)) out.push(k)
  return out
}
export const currentMonth = () => monthOf(todayPH())
