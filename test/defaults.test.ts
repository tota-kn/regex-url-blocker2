import { describe, expect, it } from 'vitest'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '../utils/defaults'

describe('DEFAULT_GLOBAL_SETTINGS', () => {
  it('SPEC.md の既定値と一致する', () => {
    expect(DEFAULT_GLOBAL_SETTINGS.redirectUrl).toBe('https://example.com')
    expect(DEFAULT_GLOBAL_SETTINGS.dailyResetHour).toBe('00:00')
  })
})

describe('createEmptyGroup', () => {
  it('SPEC.md 準拠の空グループを返す', () => {
    const g = createEmptyGroup()
    expect(g.name).toBe('')
    expect(g.patterns).toEqual([])
    expect(g.dailyTimeLimitMinutes).toBeNull()
    expect(g.allowedHours).toEqual([])
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
