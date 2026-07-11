import { describe, expect, it } from 'vitest'
import { createDefaultRestriction, DEFAULT_GLOBAL_SETTINGS, createGroupFromTemplate } from '../utils/defaults'
import type { DayOfWeek } from '../utils/types'
import { createEmptyGroup } from './helpers'

describe('DEFAULT_GLOBAL_SETTINGS', () => {
  it('仕様書の既定値と一致する', () => {
    expect(DEFAULT_GLOBAL_SETTINGS.blockAction).toBe('blockedPage')
    expect(DEFAULT_GLOBAL_SETTINGS.redirectUrl).toBe('https://example.com')
    expect(DEFAULT_GLOBAL_SETTINGS.dailyResetHour).toBe('03:00')
    expect(DEFAULT_GLOBAL_SETTINGS.remainingTimeNotificationsEnabled).toBe(true)
    expect(DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes).toBe(5)
    expect(DEFAULT_GLOBAL_SETTINGS.pageOpenNotificationsEnabled).toBe(true)
    expect(DEFAULT_GLOBAL_SETTINGS.blockNotificationsEnabled).toBe(true)
  })
})

describe('createDefaultRestriction', () => {
  it('base 省略時は毎日条件・終日ウィンドウで生成する', () => {
    const restriction = createDefaultRestriction('block')
    expect(restriction).toEqual({ condition: { type: 'daily' }, timeRanges: [], type: 'block' })
  })

  it('base 指定時は condition/timeRanges を引き継ぎ type だけ切り替える', () => {
    const base = { condition: { type: 'weekly' as const, daysOfWeek: [1, 2] as DayOfWeek[] }, timeRanges: [{ startMinute: 60, endMinute: 120 }] }
    const restriction = createDefaultRestriction('grace', base)
    expect(restriction).toEqual({ condition: base.condition, timeRanges: base.timeRanges, type: 'grace' })
  })
})

describe('createEmptyGroup', () => {
  it('仕様書準拠の空グループを返す', () => {
    const g = createEmptyGroup()
    expect(g.name).toBe('')
    expect(g.mode).toBe('blacklist')
    expect(g.disabled).toBe(false)
    expect(g.lockMode).toBe(false)
    expect(g.patterns).toEqual([])
    expect(g.blockAction).toBe('blockedPage')
    expect(g.redirectUrl).toBe('https://example.com')
    expect(g.restrictionRules).toEqual([])
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

describe('createGroupFromTemplate', () => {
  it('blank は空のURLパターンと制限なしを返す', () => {
    const group = createGroupFromTemplate('blank')

    expect(group.patterns).toEqual([])
    expect(group.restrictionRules).toEqual([])
  })

  it('core-sns-15min はSNSパターンと毎日15分上限の猶予制限を設定する', () => {
    const group = createGroupFromTemplate('core-sns-15min')

    expect(group.patterns).toEqual([
      'x.com',
      'twitter.com',
      'instagram.com',
      'facebook.com',
      'tiktok.com',
      'threads.net',
      'bsky.app',
    ])
    expect(group.restrictionRules?.[0]).toMatchObject({
      condition: { type: 'daily' },
      timeRanges: [],
      type: 'grace',
      graceMinutes: 15,
    })
  })

  it('video-30min は動画パターンと毎日30分上限の猶予制限を設定する', () => {
    const group = createGroupFromTemplate('video-30min')

    expect(group.patterns).toEqual([
      'youtube.com',
      'youtu.be',
      'twitch.tv',
      'netflix.com',
      'primevideo.com',
      'abema.tv',
      'nicovideo.jp',
    ])
    expect(group.restrictionRules?.[0]).toMatchObject({
      condition: { type: 'daily' },
      timeRanges: [],
      type: 'grace',
      graceMinutes: 30,
    })
  })

  it('work-hours-focus は平日09:00-18:00のブロック制限を設定する', () => {
    const group = createGroupFromTemplate('work-hours-focus')

    expect(group.patterns).toEqual([])
    expect(group.restrictionRules?.[0]).toMatchObject({
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      timeRanges: [{ startMinute: 540, endMinute: 1080 }],
      type: 'block',
    })
  })
})
