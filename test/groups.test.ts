import { describe, expect, it } from 'vitest'
import {
  cloneGroup,
  cloneSettings,
  duplicateGroup,
  formatBlockDestination,
  formatGroupMode,
  formatScheduleRuleCondition,
  formatStandaloneRestriction,
  formatTimeWindow,
} from '../utils/groups'
import type { Group, Settings } from '../utils/types'
import { dailyRestriction } from './helpers'

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
    blockAction: 'blockedPage',
    redirectUrl: 'https://redirect.test/',
    ...overrides,
  }
}

/**
 * テスト用設定を生成する。
 */
function settings(groups: Group[]): Settings {
  return {
    global: {
      blockAction: 'blockedPage',
      redirectUrl: 'https://redirect.test/',
      dailyResetHour: '03:00',
      remainingTimeNotificationsEnabled: true,
      notificationThresholdMinutes: 5,
    },
    groups,
  }
}

describe('group utilities', () => {
  it('グループ表示ラベルを返す', () => {
    expect(formatGroupMode(group({ mode: 'blacklist' }))).toBe('Block matches')
    expect(formatGroupMode(group({ mode: 'whitelist' }))).toBe('Allow only matches')
    expect(formatBlockDestination(group({ blockAction: 'blockedPage' }))).toBe('Blocked page')
    expect(
      formatBlockDestination(
        group({
          blockAction: 'redirect',
          redirectUrl: 'https://blocked.test/',
        }),
      ),
    ).toBe('Redirect to https://blocked.test/')
  })

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

  it('分離形式の制限を読み取り表示用に要約する', () => {
    expect(formatStandaloneRestriction({ type: 'block' })).toBe('Block')
    expect(
      formatStandaloneRestriction({ type: 'redirect', redirectUrl: 'https://elsewhere.test/' }),
    ).toBe('Redirect to https://elsewhere.test/')
    expect(formatStandaloneRestriction({ type: 'redirect' })).toBe('Redirect')
    expect(formatStandaloneRestriction({ type: 'grace', graceMinutes: 15 })).toBe(
      'Daily limit 15 min/day',
    )
    expect(formatStandaloneRestriction({ type: 'wait', waitSeconds: 5, waitGrantMinutes: 1 })).toBe(
      'Wait 5 sec, allow 1 min',
    )
  })

  it('グループを独立した deep clone として複製する', () => {
    const original = group({
      ...dailyRestriction('block', {
        timeRanges: [{ startMinute: 540, endMinute: 750 }],
      }),
    })
    const cloned = cloneGroup(original)

    cloned.patterns.push('news\\.example')
    const clonedWindow = cloned.timeWindows![0]
    if (clonedWindow.type === 'scheduled') clonedWindow.timeRanges[0].startMinute = 600

    expect(original.patterns).toEqual(['example\\.com'])
    expect(original.timeWindows![0]).toEqual({
      type: 'scheduled',
      condition: { type: 'daily' },
      timeRanges: [{ startMinute: 540, endMinute: 750 }],
    })
  })

  it('新しい id と copy 名で編集可能な複製値を作る', () => {
    const original = group({
      name: 'Focus',
      disabled: true,
      lockMode: true,
      timeWindows: [{ type: 'always' }],
      restrictions: [{ type: 'grace', graceMinutes: 15 }],
    })
    const duplicated = duplicateGroup(original)

    expect(duplicated).toEqual({
      ...original,
      id: expect.any(String),
      name: 'Focus copy',
    })
    expect(duplicated.id).not.toBe(original.id)

    duplicated.patterns.push('news.example')
    duplicated.restrictions![0].graceMinutes = 30
    expect(original.patterns).toEqual(['example\\.com'])
    expect(original.restrictions![0].graceMinutes).toBe(15)
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
