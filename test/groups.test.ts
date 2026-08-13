import { describe, expect, it } from 'vitest'
import {
  cloneGroup,
  cloneSettings,
  duplicateGroup,
  formatScheduleRuleCondition,
  formatTimeWindow,
} from '../utils/groups'
import { formatRuleRestriction, formatRuleSentence } from '../utils/rules'
import type { Group, Settings } from '../utils/types'
import { dailyRule } from './helpers'

/**
 * テスト用グループを生成する。
 */
function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Group',
    mode: 'blacklist',
    disabled: false,
    lockMode: false,
    patterns: ['example\\.com'],
    pauseAllowed: true,
    rules: [],
    ...overrides,
  }
}

/**
 * テスト用設定を生成する。
 */
function settings(groups: Group[]): Settings {
  return {
    global: {
      dailyResetHour: '03:00',
      remainingTimeNotificationsEnabled: true,
      notificationThresholdMinutes: 5,
    },
    groups,
  }
}

describe('group utilities', () => {
  it('スケジュールルールの条件を読み取り表示用の文言にする', () => {
    expect(formatScheduleRuleCondition({ type: 'daily' })).toBe('Every day')
    expect(formatScheduleRuleCondition({ type: 'weekly', daysOfWeek: [0, 6] })).toBe(
      'Weekly Sun, Sat',
    )
    expect(formatScheduleRuleCondition({ type: 'monthly', daysOfMonth: [1, 15] })).toBe(
      'Monthly 1, 15',
    )
    expect(
      formatScheduleRuleCondition({
        type: 'period',
        start: { month: 12, day: 28 },
        end: { month: 1, day: 3 },
      }),
    ).toBe('12/28-01/03')
  })

  it('時間ウィンドウを読み取り表示用に要約する', () => {
    expect(formatTimeWindow({ type: 'always' })).toBe('Always')
    expect(
      formatTimeWindow({
        type: 'scheduled',
        condition: { type: 'daily' },
        timeRanges: [{ startMinute: 540, endMinute: 750 }],
      }),
    ).toBe('Every day 09:00-12:30')
    expect(
      formatTimeWindow({
        type: 'scheduled',
        condition: { type: 'weekly', daysOfWeek: [6] },
        timeRanges: [],
      }),
    ).toBe('Weekly Sat All day')
  })

  it('ルールの制限内容を読み取り表示用に要約する', () => {
    expect(formatRuleRestriction({ kind: 'block' })).toBe('Block access')
    expect(formatRuleRestriction({ kind: 'dailyLimit', minutes: 15 })).toBe('Allow 15 min per day')
    expect(formatRuleRestriction({ kind: 'wait', seconds: 5, grantMinutes: 1 })).toBe(
      'Wait 5 sec, then allow 1 min',
    )
  })

  it('ルール1件を「いつ → 何を → どこへ」の自然文にする', () => {
    expect(
      formatRuleSentence({
        id: 'r1',
        window: { type: 'always' },
        restriction: { kind: 'block' },
        destination: { type: 'redirect', url: 'https://elsewhere.test/' },
      }),
    ).toBe('Always → Block access → https://elsewhere.test/')
    expect(
      formatRuleSentence({
        id: 'r2',
        window: { type: 'always' },
        restriction: { kind: 'wait', seconds: 60, grantMinutes: 10 },
      }),
    ).toBe('Always → Wait 60 sec, then allow 10 min')
  })

  it('グループを独立した deep clone として複製する', () => {
    const original = group({
      ...dailyRule({ kind: 'block' }, { timeRanges: [{ startMinute: 540, endMinute: 750 }] }),
    })
    const cloned = cloneGroup(original)

    cloned.patterns.push('news\\.example')
    const clonedWindow = cloned.rules[0]!.window
    if (clonedWindow.type === 'scheduled') clonedWindow.timeRanges[0].startMinute = 600

    expect(original.patterns).toEqual(['example\\.com'])
    expect(original.rules[0]!.window).toEqual({
      type: 'scheduled',
      condition: { type: 'daily' },
      timeRanges: [{ startMinute: 540, endMinute: 750 }],
    })
  })

  it('新しい id と copy 名で編集可能な複製値を作る。ルール id も採番し直す', () => {
    const original = group({
      name: 'Focus',
      disabled: true,
      lockMode: true,
      ...dailyRule({ kind: 'dailyLimit', minutes: 15 }),
    })
    const duplicated = duplicateGroup(original)

    expect(duplicated.name).toBe('Focus copy')
    expect(duplicated.id).not.toBe(original.id)
    expect(duplicated.rules[0]!.id).not.toBe(original.rules[0]!.id)
    expect(duplicated.rules[0]!.restriction).toEqual(original.rules[0]!.restriction)

    duplicated.patterns.push('news.example')
    duplicated.rules[0]!.restriction = { kind: 'dailyLimit', minutes: 30 }
    expect(original.patterns).toEqual(['example\\.com'])
    expect(original.rules[0]!.restriction).toEqual({ kind: 'dailyLimit', minutes: 15 })
  })

  it('設定を独立した deep clone として複製する', () => {
    const original = settings([group()])
    const cloned = cloneSettings(original)

    cloned.global.dailyResetHour = '05:00'
    cloned.groups[0].name = 'Changed'

    expect(original.global.dailyResetHour).toBe('03:00')
    expect(original.groups[0].name).toBe('Group')
  })
})
