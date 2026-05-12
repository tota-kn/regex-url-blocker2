import { describe, expect, it } from 'vitest'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '../utils/defaults'

describe('DEFAULT_GLOBAL_SETTINGS', () => {
  it('SPEC.md の既定値と一致する', () => {
    expect(DEFAULT_GLOBAL_SETTINGS.blockAction).toBe('redirect')
    expect(DEFAULT_GLOBAL_SETTINGS.redirectUrl).toBe('https://example.com')
    expect(DEFAULT_GLOBAL_SETTINGS.dailyResetHour).toBe('00:00')
    expect(DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes).toBe(5)
  })
})

describe('createEmptyGroup', () => {
  it('SPEC.md 準拠の空グループを返す', () => {
    const g = createEmptyGroup()
    expect(g.name).toBe('')
    expect(g.mode).toBe('blacklist')
    expect(g.patterns).toEqual([])
    expect(g.dailyRules).toEqual([
      { dayOfWeek: 0, blockedTimeRanges: [], dailyLimitMinutes: undefined },
      { dayOfWeek: 1, blockedTimeRanges: [], dailyLimitMinutes: undefined },
      { dayOfWeek: 2, blockedTimeRanges: [], dailyLimitMinutes: undefined },
      { dayOfWeek: 3, blockedTimeRanges: [], dailyLimitMinutes: undefined },
      { dayOfWeek: 4, blockedTimeRanges: [], dailyLimitMinutes: undefined },
      { dayOfWeek: 5, blockedTimeRanges: [], dailyLimitMinutes: undefined },
      { dayOfWeek: 6, blockedTimeRanges: [], dailyLimitMinutes: undefined },
    ])
  })

  it('name 引数を渡すとその値を name に使用する', () => {
    const g = createEmptyGroup('グループ1')
    expect(g.name).toBe('グループ1')
  })

  it('連続呼び出しで id が異なる', () => {
    const ids = new Set([
      createEmptyGroup().id,
      createEmptyGroup().id,
      createEmptyGroup().id,
    ])
    expect(ids.size).toBe(3)
  })

  it('id は空文字でない', () => {
    expect(createEmptyGroup().id.length).toBeGreaterThan(0)
  })
})
