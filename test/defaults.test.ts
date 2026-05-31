import { describe, expect, it } from 'vitest'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup, createGroupFromTemplate } from '../utils/defaults'

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

describe('createEmptyGroup', () => {
  it('仕様書準拠の空グループを返す', () => {
    const g = createEmptyGroup()
    expect(g.name).toBe('')
    expect(g.mode).toBe('blacklist')
    expect(g.lockMode).toBe(false)
    expect(g.patterns).toEqual([])
    expect(g.blockAction).toBe('blockedPage')
    expect(g.redirectUrl).toBe('https://example.com')
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

describe('createGroupFromTemplate', () => {
  it('blank は空のURLパターンと曜日別ルールを返す', () => {
    const group = createGroupFromTemplate('blank')

    expect(group.patterns).toEqual([])
    expect(group.dailyRules).toEqual(createEmptyGroup().dailyRules)
  })

  it('core-sns-15min はSNSパターンと全曜日15分上限を設定する', () => {
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
    expect(group.dailyRules).toEqual(createEmptyGroup().dailyRules.map(rule => ({
      ...rule,
      dailyLimitMinutes: 15,
    })))
  })

  it('video-30min は動画パターンと全曜日30分上限を設定する', () => {
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
    expect(group.dailyRules).toEqual(createEmptyGroup().dailyRules.map(rule => ({
      ...rule,
      dailyLimitMinutes: 30,
    })))
  })

  it('work-hours-focus は平日に09:00-18:00のブロック時間帯を設定する', () => {
    const group = createGroupFromTemplate('work-hours-focus')

    expect(group.patterns).toEqual([])
    expect(group.dailyRules).toEqual(createEmptyGroup().dailyRules.map(rule => ({
      ...rule,
      blockedTimeRanges: rule.dayOfWeek >= 1 && rule.dayOfWeek <= 5
        ? [{ startMinute: 540, endMinute: 1080 }]
        : [],
    })))
  })
})
