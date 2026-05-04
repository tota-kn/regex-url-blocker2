import { describe, expect, test } from 'vitest'
import { isWithinAllowedHours } from '@/utils/time-of-day'

const at = (h: number, m: number) => new Date(2026, 4, 4, h, m, 0)

describe('isWithinAllowedHours', () => {
  test('空配列は常に true（24 時間 OK）', () => {
    expect(isWithinAllowedHours(at(0, 0), [])).toBe(true)
    expect(isWithinAllowedHours(at(12, 0), [])).toBe(true)
    expect(isWithinAllowedHours(at(23, 59), [])).toBe(true)
  })

  describe('通常レンジ 09:00–18:00', () => {
    const ranges = [{ start: '09:00', end: '18:00' }]
    test('内側', () => {
      expect(isWithinAllowedHours(at(12, 0), ranges)).toBe(true)
    })
    test('開始境界（含む）', () => {
      expect(isWithinAllowedHours(at(9, 0), ranges)).toBe(true)
    })
    test('終了境界（含まない）', () => {
      expect(isWithinAllowedHours(at(18, 0), ranges)).toBe(false)
    })
    test('外側', () => {
      expect(isWithinAllowedHours(at(8, 59), ranges)).toBe(false)
      expect(isWithinAllowedHours(at(20, 0), ranges)).toBe(false)
    })
  })

  describe('日跨ぎレンジ 22:00–06:00', () => {
    const ranges = [{ start: '22:00', end: '06:00' }]
    test('深夜内側', () => {
      expect(isWithinAllowedHours(at(23, 0), ranges)).toBe(true)
      expect(isWithinAllowedHours(at(3, 0), ranges)).toBe(true)
    })
    test('境界', () => {
      expect(isWithinAllowedHours(at(22, 0), ranges)).toBe(true)
      expect(isWithinAllowedHours(at(6, 0), ranges)).toBe(false)
    })
    test('外側（昼間）', () => {
      expect(isWithinAllowedHours(at(7, 0), ranges)).toBe(false)
      expect(isWithinAllowedHours(at(21, 59), ranges)).toBe(false)
    })
  })

  describe('複数レンジの和集合', () => {
    const ranges = [
      { start: '12:00', end: '13:00' },
      { start: '19:00', end: '22:00' },
    ]
    test('1番目に含まれる', () => {
      expect(isWithinAllowedHours(at(12, 30), ranges)).toBe(true)
    })
    test('2番目に含まれる', () => {
      expect(isWithinAllowedHours(at(20, 0), ranges)).toBe(true)
    })
    test('どちらにも含まれない', () => {
      expect(isWithinAllowedHours(at(15, 0), ranges)).toBe(false)
    })
  })

  test('start === end は常に false（実質ゼロ幅）', () => {
    expect(isWithinAllowedHours(at(12, 0), [{ start: '12:00', end: '12:00' }])).toBe(false)
  })
})
