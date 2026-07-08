import { describe, expect, it } from 'vitest'
import {
  isValidHHMM,
  validateGlobalSettings,
  validateGroup,
} from '../utils/validation'
import { isValidRegex, isValidUrlPattern } from '../utils/urlPatterns'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import type { ScheduleRule } from '../utils/types'
import { createEmptyGroup } from './helpers'

/**
 * テスト用のスケジュールルールを生成する。
 */
function rule(overrides: Partial<ScheduleRule> = {}): ScheduleRule {
  return {
    id: 'rule-1',
    condition: { type: 'daily' },
    blockedTimeRanges: [],
    dailyLimitMinutes: 30,
    ...overrides,
  }
}

describe('isValidRegex', () => {
  it('正しい正規表現は true', () => {
    expect(isValidRegex('^https?://')).toBe(true)
    expect(isValidRegex('.*')).toBe(true)
  })

  it('構文エラーがある正規表現は false', () => {
    expect(isValidRegex('[invalid')).toBe(false)
    expect(isValidRegex('(unclosed')).toBe(false)
  })

  it('空文字は許容しない', () => {
    expect(isValidRegex('')).toBe(false)
  })
})

describe('isValidUrlPattern', () => {
  it('裸ドメインと正規表現を valid にする', () => {
    expect(isValidUrlPattern('example.com')).toBe(true)
    expect(isValidUrlPattern('sub.example.com')).toBe(true)
    expect(isValidUrlPattern('^https?://(www\\.)?twitter\\.com')).toBe(true)
    expect(isValidUrlPattern('example\\.com')).toBe(true)
  })

  it('裸ドメインとしても正規表現としても不正な値は invalid にする', () => {
    expect(isValidUrlPattern('')).toBe(false)
    expect(isValidUrlPattern('[invalid')).toBe(false)
  })
})

describe('isValidHHMM', () => {
  it('正常な時刻文字列は true', () => {
    expect(isValidHHMM('00:00')).toBe(true)
    expect(isValidHHMM('09:30')).toBe(true)
    expect(isValidHHMM('23:59')).toBe(true)
  })

  it('範囲外・形式不正は false', () => {
    expect(isValidHHMM('24:00')).toBe(false)
    expect(isValidHHMM('9:30')).toBe(false)
    expect(isValidHHMM('25:61')).toBe(false)
    expect(isValidHHMM('')).toBe(false)
    expect(isValidHHMM('abc')).toBe(false)
  })
})

describe('validateGroup', () => {
  it('正常なグループはエラーなし', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'Twitter',
      patterns: ['^https?://(www\\.)?twitter\\.com'],
      scheduleRules: [rule({
        condition: { type: 'weekly', daysOfWeek: [3] },
        blockedTimeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }],
        dailyLimitMinutes: 30,
      })],
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('空 name・無効 pattern でそれぞれエラー', () => {
    const errors = validateGroup({
      id: 'x',
      name: '   ',
      mode: 'blacklist',
      disabled: false,
      lockMode: false,
      patterns: ['['],
      blockAction: DEFAULT_GLOBAL_SETTINGS.blockAction,
      redirectUrl: DEFAULT_GLOBAL_SETTINGS.redirectUrl,
      scheduleRules: [],
    })
    expect(errors.some(e => e.field === 'name')).toBe(true)
    expect(errors.some(e => e.field === 'patterns[0]' && e.message === 'Invalid URL pattern')).toBe(true)
  })

  it('スケジュールルールが空でも valid（制限なし）', () => {
    const g = { ...createEmptyGroup(), name: 'X' }
    expect(validateGroup(g)).toEqual([])
  })

  it('mode が whitelist も valid', () => {
    const g = { ...createEmptyGroup(), name: 'X', mode: 'whitelist' as const }
    expect(validateGroup(g)).toEqual([])
  })

  it('mode が不正値だとエラー', () => {
    const g = { ...createEmptyGroup(), name: 'X', mode: 'invalid' as 'blacklist' }
    expect(validateGroup(g).some(e => e.field === 'mode')).toBe(true)
  })

  it('redirect のときだけ redirectUrl を検証する', () => {
    expect(validateGroup({ ...createEmptyGroup(), name: 'X', blockAction: 'blockedPage', redirectUrl: '' })).toEqual([])

    const missingUrlErrors = validateGroup({ ...createEmptyGroup(), name: 'X', blockAction: 'redirect', redirectUrl: '' })
    expect(missingUrlErrors.some(e => e.field === 'redirectUrl')).toBe(true)

    const invalidUrlErrors = validateGroup({ ...createEmptyGroup(), name: 'X', blockAction: 'redirect', redirectUrl: 'not-url' })
    expect(invalidUrlErrors.some(e => e.field === 'redirectUrl')).toBe(true)

    expect(validateGroup({ ...createEmptyGroup(), name: 'X', blockAction: 'redirect', redirectUrl: 'https://blocked.test' })).toEqual([])
  })
})

describe('validateScheduleRule (validateGroup 経由)', () => {
  /** 指定ルール1件のグループを検証する。 */
  function validateRules(...rules: ScheduleRule[]): ReturnType<typeof validateGroup> {
    return validateGroup({ ...createEmptyGroup(), name: 'X', scheduleRules: rules })
  }

  it('日跨ぎのブロック時間帯は valid', () => {
    expect(validateRules(rule({
      blockedTimeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }],
      dailyLimitMinutes: undefined,
    }))).toEqual([])
  })

  it('24:00 相当の 1440 は valid', () => {
    expect(validateRules(rule({
      blockedTimeRanges: [{ startMinute: 0, endMinute: 1440 }],
      dailyLimitMinutes: undefined,
    }))).toEqual([])
  })

  it('startMinute / endMinute が範囲外だとエラー', () => {
    const startErrors = validateRules(rule({ blockedTimeRanges: [{ startMinute: -1, endMinute: 360 }] }))
    expect(startErrors.some(e => e.field === 'scheduleRules[0].blockedTimeRanges[0].startMinute')).toBe(true)

    const endErrors = validateRules(rule({ blockedTimeRanges: [{ startMinute: 1320, endMinute: 1441 }] }))
    expect(endErrors.some(e => e.field === 'scheduleRules[0].blockedTimeRanges[0].endMinute')).toBe(true)
  })

  it('weekly の曜日が空・範囲外・重複だとエラー', () => {
    expect(validateRules(rule({ condition: { type: 'weekly', daysOfWeek: [] } }))
      .some(e => e.field === 'scheduleRules[0].condition.daysOfWeek')).toBe(true)
    expect(validateRules(rule({ condition: { type: 'weekly', daysOfWeek: [7 as 0] } }))
      .some(e => e.field === 'scheduleRules[0].condition.daysOfWeek')).toBe(true)
    expect(validateRules(rule({ condition: { type: 'weekly', daysOfWeek: [1, 1] } }))
      .some(e => e.field === 'scheduleRules[0].condition.daysOfWeek')).toBe(true)
    expect(validateRules(rule({ condition: { type: 'weekly', daysOfWeek: [0, 6] } }))).toEqual([])
  })

  it('monthly の日付が空・0・32・重複だとエラー', () => {
    expect(validateRules(rule({ condition: { type: 'monthly', daysOfMonth: [] } }))
      .some(e => e.field === 'scheduleRules[0].condition.daysOfMonth')).toBe(true)
    expect(validateRules(rule({ condition: { type: 'monthly', daysOfMonth: [0] } }))
      .some(e => e.field === 'scheduleRules[0].condition.daysOfMonth')).toBe(true)
    expect(validateRules(rule({ condition: { type: 'monthly', daysOfMonth: [32] } }))
      .some(e => e.field === 'scheduleRules[0].condition.daysOfMonth')).toBe(true)
    expect(validateRules(rule({ condition: { type: 'monthly', daysOfMonth: [1, 1] } }))
      .some(e => e.field === 'scheduleRules[0].condition.daysOfMonth')).toBe(true)
    expect(validateRules(rule({ condition: { type: 'monthly', daysOfMonth: [1, 15, 31] } }))).toEqual([])
  })

  it('period は 2/29 を許容し 2/30 や 13月を拒否する', () => {
    expect(validateRules(rule({
      condition: { type: 'period', start: { month: 2, day: 29 }, end: { month: 2, day: 29 } },
    }))).toEqual([])
    expect(validateRules(rule({
      condition: { type: 'period', start: { month: 2, day: 30 }, end: { month: 3, day: 1 } },
    })).some(e => e.field === 'scheduleRules[0].condition.start')).toBe(true)
    expect(validateRules(rule({
      condition: { type: 'period', start: { month: 12, day: 28 }, end: { month: 13, day: 1 } },
    })).some(e => e.field === 'scheduleRules[0].condition.end')).toBe(true)
  })

  it('年跨ぎの period は valid', () => {
    expect(validateRules(rule({
      condition: { type: 'period', start: { month: 12, day: 28 }, end: { month: 1, day: 3 } },
    }))).toEqual([])
  })

  it('dailyLimitMinutes は 0 と undefined を許容し、負数・小数を拒否する', () => {
    expect(validateRules(rule({ dailyLimitMinutes: 0 }))).toEqual([])
    expect(validateRules(rule({ dailyLimitMinutes: -1 }))
      .some(e => e.field === 'scheduleRules[0].dailyLimitMinutes')).toBe(true)
    expect(validateRules(rule({ dailyLimitMinutes: 1.5 }))
      .some(e => e.field === 'scheduleRules[0].dailyLimitMinutes')).toBe(true)
  })

  it('ブロック時間帯も上限もないルールはエラー', () => {
    expect(validateRules(rule({ blockedTimeRanges: [], dailyLimitMinutes: undefined }))
      .some(e => e.field === 'scheduleRules[0]')).toBe(true)
  })
})

describe('validateGlobalSettings', () => {
  it('正常な設定はエラーなし', () => {
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      blockAction: 'redirect',
      redirectUrl: 'https://example.com',
      dailyResetHour: '00:00',
    })).toEqual([])
  })

  it('無効 URL と HH:MM で2件のエラー', () => {
    const errors = validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      blockAction: 'redirect',
      redirectUrl: 'not-a-url',
      dailyResetHour: '99:99',
    })
    expect(errors.some(e => e.field === 'redirectUrl')).toBe(true)
    expect(errors.some(e => e.field === 'dailyResetHour')).toBe(true)
  })

  it('redirectUrl が空でもエラー', () => {
    const errors = validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      blockAction: 'redirect',
      redirectUrl: '',
      dailyResetHour: '00:00',
    })
    expect(errors.some(e => e.field === 'redirectUrl')).toBe(true)
  })

  it('blockedPage では redirectUrl が不正でも valid', () => {
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      blockAction: 'blockedPage',
      redirectUrl: '',
      dailyResetHour: '00:00',
    })).toEqual([])
  })

  it('blockAction が不正値だとエラー', () => {
    const errors = validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      blockAction: 'invalid' as 'redirect',
      redirectUrl: 'https://example.com',
      dailyResetHour: '00:00',
    })
    expect(errors.some(e => e.field === 'blockAction')).toBe(true)
  })

  it('notificationThresholdMinutes は 1 以上の整数を許可する', () => {
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      notificationThresholdMinutes: 10,
    })).toEqual([])
  })

  it('notificationThresholdMinutes が 0、負数、または小数だとエラー', () => {
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      notificationThresholdMinutes: 0,
    }).some(e => e.field === 'notificationThresholdMinutes')).toBe(true)
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      notificationThresholdMinutes: -1,
    }).some(e => e.field === 'notificationThresholdMinutes')).toBe(true)
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      notificationThresholdMinutes: 1.5,
    }).some(e => e.field === 'notificationThresholdMinutes')).toBe(true)
  })

  it('通知ON/OFF設定が boolean でないとエラー', () => {
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      remainingTimeNotificationsEnabled: 'yes' as unknown as boolean,
    }).some(e => e.field === 'remainingTimeNotificationsEnabled')).toBe(true)
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      pageOpenNotificationsEnabled: 'yes' as unknown as boolean,
    }).some(e => e.field === 'pageOpenNotificationsEnabled')).toBe(true)
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      blockNotificationsEnabled: 1 as unknown as boolean,
    }).some(e => e.field === 'blockNotificationsEnabled')).toBe(true)
  })
})
