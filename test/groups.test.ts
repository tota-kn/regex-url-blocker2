import { describe, expect, it } from 'vitest'
import { createEmptyDailyRules } from '../utils/defaults'
import {
  cloneGroup,
  cloneSettings,
  formatBlockDestination,
  formatDailyRule,
  formatGroupMode,
} from '../utils/groups'
import type { Group, Settings } from '../utils/types'

/**
 * テスト用グループを生成する。
 */
function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Group',
    mode: 'blacklist',
    lockMode: false,
    patterns: ['example\\.com'],
    blockAction: 'blockedPage',
    redirectUrl: 'https://redirect.test/',
    dailyRules: createEmptyDailyRules(),
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
    expect(formatDailyRule({
      dayOfWeek: 0,
      blockedTimeRanges: [{ startMinute: 540, endMinute: 750 }],
      dailyLimitMinutes: 10,
    })).toBe('Blocked time: 09:00-12:30; Daily limit: 10 min')
  })

  it('グループを独立した deep clone として複製する', () => {
    const original = group({
      dailyRules: [{
        dayOfWeek: 0,
        blockedTimeRanges: [{ startMinute: 540, endMinute: 750 }],
        dailyLimitMinutes: 10,
      }],
    })
    const cloned = cloneGroup(original)

    cloned.patterns.push('news\\.example')
    cloned.dailyRules[0].blockedTimeRanges[0].startMinute = 600

    expect(original.patterns).toEqual(['example\\.com'])
    expect(original.dailyRules[0].blockedTimeRanges[0].startMinute).toBe(540)
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
