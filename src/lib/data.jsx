import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, fetchAll } from './supabase.js'
import { loanState, todayPH } from './loanMath.js'

const DataCtx = createContext(null)

export function DataProvider({ children }) {
  const [raw, setRaw] = useState({ settings: null, clients: [], loans: [], payments: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      const [settingsRes, clients, loans, payments] = await Promise.all([
        supabase.from('settings').select('*').eq('id', 1).single(),
        fetchAll('clients'),
        fetchAll('loans', '*', 'loan_no'),
        fetchAll('payments', '*', 'paid_on'),
      ])
      if (settingsRes.error) throw settingsRes.error
      setRaw({ settings: settingsRes.data, clients, loans, payments })
      setError(null)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const derived = useMemo(() => {
    const today = todayPH()
    const penaltyRate = raw.settings?.penalty_rate ?? 3
    const clientsById = Object.fromEntries(raw.clients.map((c) => [c.id, c]))
    const paysByLoan = {}
    raw.payments.forEach((p) => (paysByLoan[p.loan_id] ||= []).push(p))
    const loans = raw.loans.map((l) => {
      const payments = paysByLoan[l.id] || []
      return { ...l, client: clientsById[l.client_id], payments, state: loanState(l, payments, today, penaltyRate) }
    })
    const loansByClient = {}
    loans.forEach((l) => (loansByClient[l.client_id] ||= []).push(l))
    return { today, clientsById, loans, loansByClient, loansById: Object.fromEntries(loans.map((l) => [l.id, l])) }
  }, [raw])

  const value = { ...raw, ...derived, loading, error, reload }
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

export const useData = () => useContext(DataCtx)
