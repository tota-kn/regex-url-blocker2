import { describe, expect, it } from 'vitest'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyScheduleRule, createGroupFromTemplate } from '../utils/defaults'
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

describe('createEmptyScheduleRule', () => {
  it('毎日条件・制限なしのルールを一意な id で生成する', () => {
    const rule = createEmptyScheduleRule()
    expect(rule.condition).toEqual({ type: 'daily' })
    expect(rule.blockedTimeRanges).toEqual([])
    expect(rule.dailyLimitMinutes).toBeUndefined()
    expect(rule.id.length).toBeGreaterThan(0)
    expect(createEmptyScheduleRule().id).not.toBe(rule.id)
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
    expect(g.scheduleRules).toEqual([])
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
  it('blank は空のURLパターンとスケジュールルールを返す', () => {
    const group = createGroupFromTemplate('blank')

    expect(group.patterns).toEqual([])
    expect(group.scheduleRules).toEqual([])
  })

  it('core-sns-15min はSNSパターンと毎日15分上限のルールを設定する', () => {
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
    expect(group.scheduleRules).toHaveLength(1)
    expect(group.scheduleRules[0]).toMatchObject({
      condition: { type: 'daily' },
      blockedTimeRanges: [],
      dailyLimitMinutes: 15,
    })
  })

  it('video-30min は動画パターンと毎日30分上限のルールを設定する', () => {
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
    expect(group.scheduleRules).toHaveLength(1)
    expect(group.scheduleRules[0]).toMatchObject({
      condition: { type: 'daily' },
      blockedTimeRanges: [],
      dailyLimitMinutes: 30,
    })
  })

  it('work-hours-focus は平日09:00-18:00のブロック時間帯ルールを設定する', () => {
    const group = createGroupFromTemplate('work-hours-focus')

    expect(group.patterns).toEqual([])
    expect(group.scheduleRules).toHaveLength(1)
    expect(group.scheduleRules[0]).toMatchObject({
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      blockedTimeRanges: [{ startMinute: 540, endMinute: 1080 }],
      dailyLimitMinutes: undefined,
    })
  })
})
