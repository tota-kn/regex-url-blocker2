import { describe, expect, test } from 'vitest'
import { getLogicalDate, hhmmToMinutes, msUntilNextLogicalDay } from '@/utils/logical-day'

describe('hhmmToMinutes', () => {
  test('"00:00" は 0', () => {
    expect(hhmmToMinutes('00:00')).toBe(0)
  })
  test('"04:30" は 270', () => {
    expect(hhmmToMinutes('04:30')).toBe(270)
  })
  test('"23:59" は 1439', () => {
    expect(hhmmToMinutes('23:59')).toBe(1439)
  })
})

describe('getLogicalDate', () => {
  test('リセット時刻 00:00、現在 12:00 → 当日', () => {
    const now = new Date(2026, 4, 4, 12, 0, 0)
    expect(getLogicalDate(now, '00:00')).toBe('2026-05-04')
  })
  test('リセット時刻 04:00、現在 03:59 → 前日扱い', () => {
    const now = new Date(2026, 4, 4, 3, 59, 0)
    expect(getLogicalDate(now, '04:00')).toBe('2026-05-03')
  })
  test('リセット時刻 04:00、現在 04:00 → 当日', () => {
    const now = new Date(2026, 4, 4, 4, 0, 0)
    expect(getLogicalDate(now, '04:00')).toBe('2026-05-04')
  })
  test('リセット時刻 04:00、現在 05:00 → 当日', () => {
    const now = new Date(2026, 4, 4, 5, 0, 0)
    expect(getLogicalDate(now, '04:00')).toBe('2026-05-04')
  })
  test('リセット時刻 00:00、現在 00:00 ちょうど → 当日（境界は含む）', () => {
    const now = new Date(2026, 4, 4, 0, 0, 0)
    expect(getLogicalDate(now, '00:00')).toBe('2026-05-04')
  })
})

describe('msUntilNextLogicalDay', () => {
  test('リセット時刻 00:00、現在 23:59:30 → 30000ms', () => {
    const now = new Date(2026, 4, 4, 23, 59, 30)
    expect(msUntilNextLogicalDay(now, '00:00')).toBe(30_000)
  })
  test('リセット時刻 04:00、現在 03:59:00 → 60000ms', () => {
    const now = new Date(2026, 4, 4, 3, 59, 0)
    expect(msUntilNextLogicalDay(now, '04:00')).toBe(60_000)
  })
  test('リセット時刻 04:00、現在 04:00:00 → 24時間後', () => {
    const now = new Date(2026, 4, 4, 4, 0, 0)
    expect(msUntilNextLogicalDay(now, '04:00')).toBe(24 * 60 * 60 * 1000)
  })
})
