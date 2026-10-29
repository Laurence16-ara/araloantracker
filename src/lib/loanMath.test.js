import { test } from 'node:test'
import assert from 'node:assert/strict'
import { schedulePlan, loanState, addMonths } from './loanMath.js'

const base = { principal: 10000, interest: 2000, release_date: '2026-10-28', status: 'active' }

test('month math clamps', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15')
})

test('plans', () => {
  assert.deepEqual(schedulePlan({ ...base, schedule: 'monthly' }).map((p) => [p.due, p.amount]), [['2026-11-28', 12000]])
  assert.deepEqual(schedulePlan({ ...base, schedule: 'semi_monthly' }).map((p) => [p.due, p.amount]), [['2026-11-12', 6000], ['2026-11-28', 6000]])
  assert.deepEqual(schedulePlan({ ...base, schedule: 'weekly' }).map((p) => p.amount), [3000, 3000, 3000, 3000])
  assert.deepEqual(schedulePlan({ principal: 1000, interest: 150, schedule: 'weekly', release_date: '2026-10-01' }).map((p) => p.amount), [288, 288, 288, 286])
})

test('weekly missed payment = 90/day', () => {
  const s = loanState({ ...base, schedule: 'weekly' }, [], '2026-11-07', 3)
  assert.equal(s.display, 'overdue')
  assert.equal(s.penaltyAccrued, 270) // due 11-04, 3 days late × ₱90
})

test('partial then full', () => {
  const loan = { ...base, schedule: 'monthly' }
  // due 11-28; pay 6000 on 11-30, rest on 12-02
  const s = loanState(loan, [{ paid_on: '2026-11-30', amount: 6000 }, { paid_on: '2026-12-02', amount: 6000 }], '2026-12-10', 3)
  // 2 days on 12000 = 720, 2 days on 6000 = 360
  assert.equal(s.penaltyAccrued, 1080)
  assert.equal(s.balance, 0)
  assert.equal(s.installments[0].status, 'paid_late')
})

test('on-time paid has no penalty, waived zero', () => {
  const s = loanState({ ...base, schedule: 'monthly' }, [{ paid_on: '2026-11-28', amount: 12000 }], '2027-01-01')
  assert.equal(s.penaltyAccrued, 0)
  const w = loanState({ ...base, schedule: 'monthly', penalty_waived: true }, [], '2027-01-01')
  assert.equal(w.penaltyAccrued, 0)
  assert.equal(w.display, 'overdue')
})
