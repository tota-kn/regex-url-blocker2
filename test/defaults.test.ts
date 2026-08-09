import { describe, expect, it } from 'vitest'
import {
  createDefaultRule,
  DEFAULT_GLOBAL_SETTINGS,
  createGroupFromTemplate,
} from '../utils/defaults'
import { createEmptyGroup } from './helpers'

describe('DEFAULT_GLOBAL_SETTINGS', () => {
  it('仕様書の既定値と一致する', () => {
    expect(DEFAULT_GLOBAL_SETTINGS.dailyResetHour).toBe('03:00')
    expect(DEFAULT_GLOBAL_SETTINGS.remainingTimeNotificationsEnabled).toBe(true)
    expect(DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes).toBe(5)
  })
})

describe('createDefaultRule', () => {
  it('block は常時ウィンドウとブロックページ遷移を持つ', () => {
    const rule = createDefaultRule('block')
    expect(rule.window).toEqual({ type: 'always' })
    expect(rule.restriction).toEqual({ kind: 'block' })
    expect(rule.destination).toEqual({ type: 'blockedPage' })
  })

  it('dailyLimit / wait / sessionLimit は初期表示でエラーにならない既定値を持つ', () => {
    expect(createDefaultRule('dailyLimit').restriction).toEqual({
      kind: 'dailyLimit',
      minutes: 30,
    })
    expect(createDefaultRule('wait').restriction).toEqual({
      kind: 'wait',
      seconds: 60,
      grantMinutes: 10,
    })
    expect(createDefaultRule('sessionLimit').restriction).toEqual({
      kind: 'sessionLimit',
      sessionMinutes: 10,
      breakMinutes: 30,
    })
  })

  it('wait はブロックしないので遷移先を持たない', () => {
    expect(createDefaultRule('wait').destination).toBeUndefined()
  })

  it('連続呼び出しで rule id が異なる', () => {
    const ids = new Set([
      createDefaultRule('block').id,
      createDefaultRule('block').id,
      createDefaultRule('block').id,
    ])
    expect(ids.size).toBe(3)
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
    expect(g.pauseAllowed).toBe(true)
    expect(g.rules).toEqual([])
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
  it('blank は空のURLパターンとルールなしを返す', () => {
    const group = createGroupFromTemplate('blank')

    expect(group.patterns).toEqual([])
    expect(group.rules).toEqual([])
  })

  it('core-sns-15min はSNSパターンと毎日15分の Daily limit を設定する', () => {
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
    expect(group.rules[0]?.window).toEqual({ type: 'always' })
    expect(group.rules[0]?.restriction).toEqual({ kind: 'dailyLimit', minutes: 15 })
  })

  it('video-30min は動画パターンと毎日30分の Daily limit を設定する', () => {
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
    expect(group.rules[0]?.window).toEqual({ type: 'always' })
    expect(group.rules[0]?.restriction).toEqual({ kind: 'dailyLimit', minutes: 30 })
  })

  it('work-hours-focus は平日09:00-18:00の Block ルールを設定する', () => {
    const group = createGroupFromTemplate('work-hours-focus')

    expect(group.patterns).toEqual([])
    expect(group.rules[0]?.window).toMatchObject({
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      timeRanges: [{ startMinute: 540, endMinute: 1080 }],
    })
    expect(group.rules[0]?.restriction).toEqual({ kind: 'block' })
  })
})
