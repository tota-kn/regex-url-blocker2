import { describe, expect, it } from 'vitest'
import {
  isValidHHMM,
  validateGlobalSettings,
  validateGroup,
} from '../utils/validation'
import { isValidRegex, isValidUrlPattern } from '../utils/urlPatterns'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '../utils/defaults'

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
      dailyRules: createEmptyGroup().dailyRules.map(rule =>
        rule.dayOfWeek === 3
          ? { ...rule, blockedTimeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }], dailyLimitMinutes: 30 }
          : rule,
      ),
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('空 name・無効 pattern でそれぞれエラー', () => {
    const errors = validateGroup({
      id: 'x',
      name: '   ',
      mode: 'blacklist',
      lockMode: false,
      patterns: ['['],
      dailyRules: createEmptyGroup().dailyRules,
    })
    expect(errors.some(e => e.field === 'name')).toBe(true)
    expect(errors.some(e => e.field === 'patterns[0]' && e.message === 'Invalid URL pattern')).toBe(true)
  })

  it('各曜日の制限が空でも valid（制限なし）', () => {
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
})

describe('validateDailyRule (validateGroup 経由)', () => {
  it('日跨ぎのブロック時間帯は valid', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'NightBlock',
      dailyRules: createEmptyGroup().dailyRules.map(rule =>
        rule.dayOfWeek === 3 ? { ...rule, blockedTimeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }] } : rule,
      ),
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('startMinute が範囲外だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      dailyRules: createEmptyGroup().dailyRules.map(rule =>
        rule.dayOfWeek === 3 ? { ...rule, blockedTimeRanges: [{ startMinute: -1, endMinute: 360 }] } : rule,
      ),
    }
    expect(validateGroup(g).some(e => e.field === 'dailyRules[3].blockedTimeRanges[0].startMinute')).toBe(true)
  })

  it('endMinute が範囲外だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      dailyRules: createEmptyGroup().dailyRules.map(rule =>
        rule.dayOfWeek === 3 ? { ...rule, blockedTimeRanges: [{ startMinute: 1320, endMinute: 1441 }] } : rule,
      ),
    }
    expect(validateGroup(g).some(e => e.field === 'dailyRules[3].blockedTimeRanges[0].endMinute')).toBe(true)
  })

  it('dailyRules が7件未満だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      dailyRules: createEmptyGroup().dailyRules.slice(0, 6),
    }
    expect(validateGroup(g).some(e => e.field === 'dailyRules')).toBe(true)
  })

  it('dailyRules の曜日が重複するとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      dailyRules: createEmptyGroup().dailyRules.map(rule => rule.dayOfWeek === 6 ? { ...rule, dayOfWeek: 5 as const } : rule),
    }
    expect(validateGroup(g).some(e => e.field === 'dailyRules')).toBe(true)
  })

  it('24:00 相当の 1440 は valid', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'WeekdayBlock',
      dailyRules: createEmptyGroup().dailyRules.map(rule =>
        rule.dayOfWeek === 3 ? { ...rule, blockedTimeRanges: [{ startMinute: 0, endMinute: 1440 }] } : rule,
      ),
    }
    expect(validateGroup(g)).toEqual([])
  })
})

describe('dailyLimitMinutes (validateGroup 経由)', () => {
  it('正常な上限設定はエラーなし', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      dailyRules: createEmptyGroup().dailyRules.map(rule => rule.dayOfWeek === 3 ? { ...rule, dailyLimitMinutes: 30 } : rule),
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('dailyMinutes が 0 は valid（即ブロック）', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      dailyRules: createEmptyGroup().dailyRules.map(rule => rule.dayOfWeek === 3 ? { ...rule, dailyLimitMinutes: 0 } : rule),
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('dailyLimitMinutes が undefined は valid（上限なし）', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('dailyMinutes が負数だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      dailyRules: createEmptyGroup().dailyRules.map(rule => rule.dayOfWeek === 3 ? { ...rule, dailyLimitMinutes: -1 } : rule),
    }
    expect(validateGroup(g).some(e => e.field === 'dailyRules[3].dailyLimitMinutes')).toBe(true)
  })

  it('dailyMinutes が小数だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      dailyRules: createEmptyGroup().dailyRules.map(rule => rule.dayOfWeek === 3 ? { ...rule, dailyLimitMinutes: 1.5 } : rule),
    }
    expect(validateGroup(g).some(e => e.field === 'dailyRules[3].dailyLimitMinutes')).toBe(true)
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

  it('notificationThresholdMinutes は 0 と正の整数を許可する', () => {
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      notificationThresholdMinutes: 0,
    })).toEqual([])
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      notificationThresholdMinutes: 10,
    })).toEqual([])
  })

  it('notificationThresholdMinutes が負数または小数だとエラー', () => {
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      notificationThresholdMinutes: -1,
    }).some(e => e.field === 'notificationThresholdMinutes')).toBe(true)
    expect(validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      notificationThresholdMinutes: 1.5,
    }).some(e => e.field === 'notificationThresholdMinutes')).toBe(true)
  })
})
