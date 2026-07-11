import { describe, expect, it } from 'vitest'
import {
  cloneGroup,
  cloneSettings,
  formatBlockDestination,
  formatGroupMode,
  formatRestriction,
  formatScheduleRuleCondition,
} from '../utils/groups'
import type { Group, RestrictionRule, Settings } from '../utils/types'
import { dailyRestriction } from './helpers'

/**
 * テスト用グループを生成する。
 */
function group(overrides: Partial<Group> = {}): Group {
  const result: Group = {
    id: 'g1',
    name: 'Group',
    mode: 'blacklist',
    disabled: false,
    lockMode: false,
    patterns: ['example\\.com'],
    blockAction: 'blockedPage',
    redirectUrl: 'https://redirect.test/',
    restriction: undefined,
    ...overrides,
  }
  if ((!result.restrictionRules || result.restrictionRules.length === 0) && result.restriction) {
    result.restrictionRules = [result.restriction]
    result.restriction = undefined
  }
  return result
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
      pageOpenNotificationsEnabled: true,
      blockNotificationsEnabled: true,
    },
    groups,
  }
}

describe('group utilities', () => {
  it('グループ表示ラベルを返す', () => {
    expect(formatGroupMode(group({ mode: 'blacklist' }))).toBe('Block matches')
    expect(formatGroupMode(group({ mode: 'whitelist' }))).toBe('Allow only matches')
    expect(formatBlockDestination(group({ blockAction: 'blockedPage' }))).toBe('Blocked page')
    expect(formatBlockDestination(group({
      blockAction: 'redirect',
      redirectUrl: 'https://blocked.test/',
    }))).toBe('Redirect to https://blocked.test/')
  })

  it('スケジュールルールの条件を読み取り表示用の文言にする', () => {
    expect(formatScheduleRuleCondition({ type: 'daily' })).toBe('Every day')
    expect(formatScheduleRuleCondition({ type: 'weekly', daysOfWeek: [0, 6] })).toBe('Weekly Sun, Sat')
    expect(formatScheduleRuleCondition({ type: 'monthly', daysOfMonth: [1, 15] })).toBe('Monthly 1, 15')
    expect(formatScheduleRuleCondition({
      type: 'period',
      start: { month: 12, day: 28 },
      end: { month: 1, day: 3 },
    })).toBe('12/28-01/03')
  })

  it('制限を読み取り表示用に要約する', () => {
    const blockRestriction: RestrictionRule = {
      condition: { type: 'daily' },
      timeRanges: [{ startMinute: 540, endMinute: 750 }],
      type: 'block',
    }
    expect(formatRestriction(blockRestriction)).toBe('Every day 09:00-12:30 — Block')

    const graceRestriction: RestrictionRule = {
      condition: { type: 'weekly', daysOfWeek: [6] },
      timeRanges: [],
      type: 'grace',
      graceMinutes: 10,
    }
    expect(formatRestriction(graceRestriction)).toBe('Weekly Sat All day — Grace 10 min/day')

    const waitRestriction: RestrictionRule = {
      condition: { type: 'daily' },
      timeRanges: [],
      type: 'wait',
      waitSeconds: 30,
    }
    expect(formatRestriction(waitRestriction)).toBe('Every day All day — Wait 30 sec')
  })

  it('グループを独立した deep clone として複製する', () => {
    const original = group({
      restriction: dailyRestriction('block', {
        timeRanges: [{ startMinute: 540, endMinute: 750 }],
      }),
    })
    const cloned = cloneGroup(original)

    cloned.patterns.push('news\\.example')
    cloned.restrictionRules![0].timeRanges[0].startMinute = 600

    expect(original.patterns).toEqual(['example\\.com'])
    expect(original.restrictionRules![0].timeRanges[0].startMinute).toBe(540)
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
