import { schedulePlan, peso, fmtDate, SCHEDULES, round2, todayPH } from './loanMath.js'

// Editable in Admin → Settings. {{placeholders}} are filled in automatically.
// **text** = bold. Blank line = new paragraph.
export const DEFAULT_TEMPLATE = `This Loan Agreement ("Agreement") is made and entered into on **{{agreement_date}}**, by and between:

**Lender:** {{lender_name}}
**Address:** {{lender_address}}

**Borrower:** {{borrower_name}}
**Address:** {{borrower_address}}
**Phone number:** {{borrower_phone}}

**1. Loan Amount and Disbursement**
The Lender agrees to provide a loan to the Borrower in the principal amount of **{{principal}}** (the "Principal Amount"). The Principal Amount shall be disbursed to the Borrower on **{{release_date}}**.

**2. Repayment**
The Borrower agrees to repay the Principal Amount plus interest on or before **{{due_date}}**. The total repayment amount shall be **{{total}}**, payable as follows: **{{payment_terms}}**.

**3. Interest**
The Principal Amount shall accrue interest of **{{interest}}** ({{interest_rate}}) for a period of **one (1) month**. The interest is included in the total repayment amount of **{{total}}**.

**4. Late Payment**
Any amount not paid on its due date shall incur a penalty of **{{penalty_rate}} of the unpaid amount for every day of delay** (for example, {{penalty_example}}), until fully paid.

**5. Separability**
If any provision of this Agreement is held to be invalid or unenforceable, such invalidity or unenforceability shall not affect the remaining provisions, which shall continue to be in full force and effect.

**6. Governing Law**
This Agreement shall be governed by and construed in accordance with the laws of the Republic of the Philippines.

**IN WITNESS WHEREOF**, the parties hereto have executed this Loan Agreement as of the day and year first above written.`

export function contractValues({ loan, client, settings, agreementDate }) {
  const total = round2(Number(loan.principal) + Number(loan.interest))
  const plan = schedulePlan(loan)
  const n = SCHEDULES[loan.schedule]?.count || 1
  const each = plan.length ? plan[0].amount : Math.round(total / n)
  let terms
  if (!loan.schedule) {
    terms = 'within one (1) month, either in one (1) payment, in two (2) payments every 15 days, or in four (4) weekly payments, as set by the Lender upon release of the loan'
  } else if (plan.length) {
    terms = plan.length === 1
      ? `one payment of ${peso(plan[0].amount)} on ${fmtDate(plan[0].due)}`
      : plan.map((p) => `${peso(p.amount)} on ${fmtDate(p.due)}`).join('; ')
  } else {
    terms = n === 1
      ? `one payment of ${peso(total)} one (1) month after release`
      : loan.schedule === 'weekly'
        ? `${n} weekly payments of ${peso(each)} (the last one on the due date)`
        : `${n} payments of ${peso(each)}, every 15 days (the last one on the due date)`
  }
  const rate = Number(settings?.penalty_rate ?? 3)
  return {
    agreement_date: fmtDate(agreementDate || todayPH(), { month: 'long', day: 'numeric', year: 'numeric' }),
    lender_name: settings?.lender_name || '',
    lender_address: settings?.lender_address || '',
    borrower_name: client?.full_name || '',
    borrower_address: client?.address || '',
    borrower_phone: client?.phone || '',
    principal: peso(loan.principal),
    release_date: loan.release_date
      ? fmtDate(loan.release_date, { month: 'long', day: 'numeric', year: 'numeric' })
      : 'the date this application is approved',
    due_date: plan.length
      ? fmtDate(plan[plan.length - 1].due, { month: 'long', day: 'numeric', year: 'numeric' })
      : 'one (1) month from the release date',
    total: peso(total),
    payment_terms: terms,
    interest: peso(loan.interest),
    interest_rate: `${Number(loan.interest_rate)}% per month`,
    penalty_rate: `${rate}%`,
    penalty_example: loan.schedule && n > 1
      ? `${peso(round2((each * rate) / 100))} per day on a missed ${peso(each)} payment, or ${peso(round2((total * rate) / 100))} per day if the full ${peso(total)} is unpaid`
      : `${peso(round2((total * rate) / 100))} per day if the full ${peso(total)} is unpaid`,
  }
}

export function fillTemplate(template, values) {
  return (template || DEFAULT_TEMPLATE).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? values[k] : m))
}

export function buildContractText(args) {
  return fillTemplate(args.settings?.contract_template, contractValues(args))
}
