import { describe, expect, it } from 'vitest'
import {
  createDefaultRestriction,
  createDefaultTimeWindow,
  DEFAULT_GLOBAL_SETTINGS,
  createGroupFromTemplate,
} from '../utils/defaults'
import { createEmptyGroup } from './helpers'

describe('DEFAULT_GLOBAL_SETTINGS', () => {
  it('仕様書の既定値と一致する', () => {
    expect(DEFAULT_GLOBAL_SETTINGS.blockAction).toBe('blockedPage')
    expect(DEFAULT_GLOBAL_SETTINGS.redirectUrl).toBe('https://example.com')
    expect(DEFAULT_GLOBAL_SETTINGS.dailyResetHour).toBe('03:00')
    expect(DEFAULT_GLOBAL_SETTINGS.remainingTimeNotificationsEnabled).toBe(true)
    expect(DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes).toBe(5)
  })
})

describe('createDefaultRestriction', () => {
  it('base 省略時は制限内容だけを生成する', () => {
    const restriction = createDefaultRestriction('block')
    expect(restriction).toEqual({ type: 'block' })
  })

  it('grace/wait は初期表示でエラーにならない既定値を持つ', () => {
    expect(createDefaultRestriction('grace')).toEqual({ type: 'grace', graceMinutes: 30 })
    expect(createDefaultRestriction('wait')).toEqual({
      type: 'wait',
      waitSeconds: 60,
      waitGrantMinutes: 10,
    })
  })

  it('redirect は既定の遷移先 URL を持つ', () => {
    expect(createDefaultRestriction('redirect')).toEqual({
      type: 'redirect',
      redirectUrl: DEFAULT_GLOBAL_SETTINGS.redirectUrl,
    })
  })
})

describe('createDefaultTimeWindow', () => {
  it('Always ウィンドウを生成する', () => {
    expect(createDefaultTimeWindow()).toEqual({ type: 'always' })
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
    expect(g.timeWindows).toEqual([])
    expect(g.restrictions).toEqual([])
  })

  it('name 引数を渡すとその値を name に使用する', () => {
    const g = createEmptyGroup('グループ1')
    expect(g.name).toBe('グループ1')
  })

  it('連続呼び出しで id が異なる', () => {
    const ids = new Set([createEmptyGroup().id, createEmptyGroup().id, createEmptyGroup().id])
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
    expect(group.timeWindows).toEqual([])
    expect(group.restrictions).toEqual([])
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
    expect(group.timeWindows).toEqual([{ type: 'always' }])
    expect(group.restrictions?.[0]).toMatchObject({
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
    expect(group.timeWindows).toEqual([{ type: 'always' }])
    expect(group.restrictions?.[0]).toMatchObject({
      type: 'grace',
      graceMinutes: 30,
    })
  })

  it('work-hours-focus は平日09:00-18:00のブロック制限を設定する', () => {
    const group = createGroupFromTemplate('work-hours-focus')

    expect(group.patterns).toEqual([])
    expect(group.timeWindows?.[0]).toMatchObject({
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      timeRanges: [{ startMinute: 540, endMinute: 1080 }],
    })
    expect(group.restrictions).toEqual([{ type: 'block' }])
  })
})
