import { utils, writeFile } from 'xlsx'
import { SCHEDULES, todayPH } from './loanMath.js'

const statusText = (l) => ({ overdue: 'Overdue', active: 'Pending', paid: 'Paid', for_release: 'Signed, to release', awaiting_signature: 'Waiting signature', rejected: 'Rejected', cancelled: 'Cancelled' })[l.state.display] || l.state.display

export function loanRows(loans) {
  return loans.map((l) => ({
    'Loan #': l.loan_no,
    Date: l.release_date || '',
    Name: l.client?.full_name || '',
    'Loan Amount': Number(l.principal),
    'Interest %': Number(l.interest_rate),
    Interest: Number(l.interest),
    Total: l.state.total,
    Schedule: SCHEDULES[l.schedule]?.label,
    'Due Date': l.state.dueDate || '',
    Paid: l.state.paid,
    Balance: l.status === 'active' ? l.state.balance : 0,
    Status: statusText(l),
    'Days Overdue': l.state.daysOverdue || '',
    Note: l.note || '',
  }))
}

export function exportMonth(label, loans) {
  downloadXlsx(`Loans ${label}.xlsx`, [{ name: label, rows: loanRows(loans) }])
}

export function exportBackup({ clients, loans, payments, loansById }) {
  downloadXlsx(`Ara Loan Tracker backup ${todayPH()}.xlsx`, [
    { name: 'Loans', rows: loanRows(loans) },
    {
      name: 'Payments',
      rows: payments.map((p) => ({
        Date: p.paid_on,
        'Loan #': loansById[p.loan_id]?.loan_no,
        Name: loansById[p.loan_id]?.client?.full_name,
        Amount: Number(p.amount),
        Penalty: Number(p.penalty),
        Method: p.method,
        Note: p.note || '',
      })),
    },
    {
      name: 'Clients',
      rows: clients.map((c) => ({
        Name: c.full_name, 'Other names': c.aliases || '', Mobile: c.phone || '', Address: c.address || '',
        Facebook: c.facebook || '', 'ID type': c.id_type || '', Status: c.status, Notes: c.notes || '', Added: c.created_at?.slice(0, 10),
      })),
    },
  ])
}

// sheets: [{ name, rows: [ {col: value} ] }]
export function downloadXlsx(filename, sheets) {
  const wb = utils.book_new()
  sheets.forEach(({ name, rows }) => {
    const ws = utils.json_to_sheet(rows.length ? rows : [{ '': 'No data' }])
    const keys = Object.keys(rows[0] || {})
    ws['!cols'] = keys.map((k) => ({ wch: Math.max(10, k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? '').length + 1)) }))
    utils.book_append_sheet(wb, ws, name.slice(0, 31))
  })
  writeFile(wb, filename)
}

