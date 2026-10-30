export const PAYOUT_METHODS = [
  ['gcash', 'GCash'],
  ['maya', 'Maya'],
  ['seabank', 'SeaBank'],
  ['other', 'Other bank / e-wallet'],
]

export function payoutLabel(loan) {
  if (!loan?.payout_method) return null
  const name = loan.payout_method === 'other'
    ? loan.payout_other || 'Other bank / e-wallet'
    : (PAYOUT_METHODS.find(([k]) => k === loan.payout_method)?.[1] || loan.payout_method)
  return `${name} · ${loan.payout_account || '—'}`
}
