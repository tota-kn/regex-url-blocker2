import { describe, expect, test } from 'vitest'
import { ensureToday, tickAccumulator } from '@/utils/accumulator'

describe('tickAccumulator', () => {
  const resetHHMM = '00:00'

  test('accumulator が undefined → consumedSec: 1 で初期化', () => {
    const now = new Date(2026, 4, 4, 12, 0, 0)
    const result = tickAccumulator(undefined, now, resetHHMM)
    expect(result).toEqual({ logicalDate: '2026-05-04', consumedSec: 1 })
  })

  test('同じ論理日 → consumedSec を +1', () => {
    const now = new Date(2026, 4, 4, 12, 0, 0)
    const prev = { logicalDate: '2026-05-04', consumedSec: 100 }
    expect(tickAccumulator(prev, now, resetHHMM).consumedSec).toBe(101)
  })

  test('論理日が変わった → consumedSec を 1 にリセット', () => {
    const now = new Date(2026, 4, 5, 1, 0, 0)
    const prev = { logicalDate: '2026-05-04', consumedSec: 1000 }
    const result = tickAccumulator(prev, now, resetHHMM)
    expect(result.consumedSec).toBe(1)
    expect(result.logicalDate).toBe('2026-05-05')
  })

  test('リセット時刻 04:00 かつ 03:59 → 前日の論理日でカウント継続', () => {
    const now = new Date(2026, 4, 5, 3, 59, 0)
    const prev = { logicalDate: '2026-05-04', consumedSec: 50 }
    const result = tickAccumulator(prev, now, '04:00')
    expect(result.logicalDate).toBe('2026-05-04')
    expect(result.consumedSec).toBe(51)
  })
})

describe('ensureToday', () => {
  const resetHHMM = '00:00'

  test('undefined → consumedSec: 0 で初期化', () => {
    const now = new Date(2026, 4, 4, 12, 0, 0)
    const result = ensureToday(undefined, now, resetHHMM)
    expect(result).toEqual({ logicalDate: '2026-05-04', consumedSec: 0 })
  })

  test('同じ論理日 → そのまま返す', () => {
    const now = new Date(2026, 4, 4, 12, 0, 0)
    const prev = { logicalDate: '2026-05-04', consumedSec: 300 }
    expect(ensureToday(prev, now, resetHHMM)).toEqual(prev)
  })

  test('論理日が変わった → consumedSec を 0 にリセット（カウントなし）', () => {
    const now = new Date(2026, 4, 5, 1, 0, 0)
    const prev = { logicalDate: '2026-05-04', consumedSec: 500 }
    const result = ensureToday(prev, now, resetHHMM)
    expect(result.consumedSec).toBe(0)
    expect(result.logicalDate).toBe('2026-05-05')
  })
})
