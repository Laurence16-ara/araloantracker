import { describe, expect, it } from 'vitest'
import { gcashFee, shiftMonth, monthEnd, monthsBetween } from './money.js'

describe('gcashFee', () => {
  it('uses the fee table', () => {
    expect(gcashFee(50)).toBe(5)
    expect(gcashFee(100)).toBe(5)
    expect(gcashFee(101)).toBe(10)
    expect(gcashFee(499)).toBe(10)
    expect(gcashFee(500)).toBe(15)
    expect(gcashFee(1000)).toBe(15)
  })
  it('splits amounts above the last tier into 1,000 chunks', () => {
    expect(gcashFee(1500)).toBe(30)
    expect(gcashFee(2000)).toBe(30)
    expect(gcashFee(1050)).toBe(20)
    expect(gcashFee(1200)).toBe(25)
    expect(gcashFee(5300)).toBe(85)
  })
  it('follows an edited table', () => {
    expect(gcashFee(300, [{ max: 500, fee: 8 }, { max: 1000, fee: 12 }])).toBe(8)
    expect(gcashFee(0)).toBe(0)
  })
})

describe('months', () => {
  it('moves across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})
