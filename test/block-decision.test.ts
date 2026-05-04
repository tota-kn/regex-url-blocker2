import { describe, expect, test } from 'vitest'
import { decideGroupBlock, decideUrlBlock } from '@/utils/block-decision'
import type { Group } from '@/utils/types'

const at = (h: number, m: number) => new Date(2026, 4, 4, h, m, 0)

const group = (override: Partial<Group> = {}): Group => ({
  id: 'g1',
  name: 'テスト',
  patterns: ['twitter\\.com'],
  dailyTimeLimitMinutes: null,
  allowedHours: [],
  ...override,
})

describe('decideGroupBlock', () => {
  test('制限なし（null 上限 + 空時間帯）→ ブロックしない', () => {
    const r = decideGroupBlock(group(), undefined, at(12, 0))
    expect(r.blocked).toBe(false)
  })

  test('消費秒数が上限に達した → daily-limit でブロック', () => {
    const r = decideGroupBlock(
      group({ dailyTimeLimitMinutes: 30 }),
      { logicalDate: '2026-05-04', consumedSec: 1800 },
      at(12, 0),
    )
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('daily-limit')
  })

  test('消費秒数が上限未満 → ブロックしない', () => {
    const r = decideGroupBlock(
      group({ dailyTimeLimitMinutes: 30 }),
      { logicalDate: '2026-05-04', consumedSec: 1799 },
      at(12, 0),
    )
    expect(r.blocked).toBe(false)
  })

  test('dailyTimeLimitMinutes: 0 は即ブロック', () => {
    const r = decideGroupBlock(
      group({ dailyTimeLimitMinutes: 0 }),
      { logicalDate: '2026-05-04', consumedSec: 0 },
      at(12, 0),
    )
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('daily-limit')
  })

  test('許可時間帯外 → time-of-day でブロック', () => {
    const r = decideGroupBlock(
      group({ allowedHours: [{ start: '09:00', end: '18:00' }] }),
      undefined,
      at(20, 0),
    )
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('time-of-day')
  })

  test('許可時間帯内 + 上限未到達 → ブロックしない', () => {
    const r = decideGroupBlock(
      group({ allowedHours: [{ start: '09:00', end: '18:00' }], dailyTimeLimitMinutes: 60 }),
      { logicalDate: '2026-05-04', consumedSec: 100 },
      at(12, 0),
    )
    expect(r.blocked).toBe(false)
  })

  test('accumulator が undefined の場合 consumedSec=0 として扱う', () => {
    const r = decideGroupBlock(
      group({ dailyTimeLimitMinutes: 30 }),
      undefined,
      at(12, 0),
    )
    expect(r.blocked).toBe(false)
  })
})

describe('decideUrlBlock', () => {
  const redirectUrl = 'https://example.com'

  test('マッチするグループがない → ブロックしない', () => {
    const r = decideUrlBlock(
      'https://google.com',
      [group()],
      {},
      at(12, 0),
      redirectUrl,
    )
    expect(r.blocked).toBe(false)
    expect(r.matchingGroupIds).toHaveLength(0)
  })

  test('マッチするグループがブロック条件を満たす → ブロック', () => {
    const r = decideUrlBlock(
      'https://twitter.com',
      [group({ dailyTimeLimitMinutes: 0 })],
      {},
      at(12, 0),
      redirectUrl,
    )
    expect(r.blocked).toBe(true)
    expect(r.blockingGroupIds).toContain('g1')
  })

  test('マッチするが全グループが通過 → ブロックしない', () => {
    const r = decideUrlBlock(
      'https://twitter.com',
      [group()],
      {},
      at(12, 0),
      redirectUrl,
    )
    expect(r.blocked).toBe(false)
    expect(r.matchingGroupIds).toContain('g1')
    expect(r.blockingGroupIds).toHaveLength(0)
  })

  test('複数グループがマッチし、1つがブロック → URL ブロック', () => {
    const g2: Group = { ...group(), id: 'g2', dailyTimeLimitMinutes: 0 }
    const r = decideUrlBlock(
      'https://twitter.com',
      [group(), g2],
      {},
      at(12, 0),
      redirectUrl,
    )
    expect(r.blocked).toBe(true)
    expect(r.matchingGroupIds).toHaveLength(2)
    expect(r.blockingGroupIds).toEqual(['g2'])
  })

  test('shouldSkipUrl の URL はブロック判定しない', () => {
    const r = decideUrlBlock(
      'https://example.com',
      [group({ patterns: ['example\\.com'] })],
      {},
      at(12, 0),
      redirectUrl,
    )
    expect(r.blocked).toBe(false)
  })
})
