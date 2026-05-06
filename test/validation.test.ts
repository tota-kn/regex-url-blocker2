import { describe, expect, it } from 'vitest'
import type { DayOfWeek } from '../utils/types'
import {
  isValidHHMM,
  isValidRegex,
  validateGlobalSettings,
  validateGroup,
} from '../utils/validation'
import { createEmptyGroup } from '../utils/defaults'

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
      blockedTimeSlots: [
        { daysOfWeek: [] as DayOfWeek[], start: '22:00', end: '06:00' },
      ],
      timeLimits: [
        { daysOfWeek: [1, 2, 3, 4, 5] as DayOfWeek[], dailyMinutes: 30 },
      ],
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('空 name・無効 pattern でそれぞれエラー', () => {
    const errors = validateGroup({
      id: 'x',
      name: '   ',
      mode: 'blacklist',
      patterns: ['['],
      blockedTimeSlots: [],
      timeLimits: [],
    })
    expect(errors.some(e => e.field === 'name')).toBe(true)
    expect(errors.some(e => e.field === 'patterns[0]')).toBe(true)
  })

  it('blockedTimeSlots・timeLimits が空配列でも valid（制限なし）', () => {
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

describe('validateBlockedTimeSlot (validateGroup 経由)', () => {
  it('日跨ぎのブロック時間帯（end <= start）は valid', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'NightBlock',
      blockedTimeSlots: [{ daysOfWeek: [] as DayOfWeek[], start: '22:00', end: '06:00' }],
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('start が HH:MM 違反だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      blockedTimeSlots: [{ daysOfWeek: [] as DayOfWeek[], start: '99:99', end: '06:00' }],
    }
    expect(validateGroup(g).some(e => e.field === 'blockedTimeSlots[0].start')).toBe(true)
  })

  it('end が HH:MM 違反だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      blockedTimeSlots: [{ daysOfWeek: [] as DayOfWeek[], start: '22:00', end: '25:00' }],
    }
    expect(validateGroup(g).some(e => e.field === 'blockedTimeSlots[0].end')).toBe(true)
  })

  it('daysOfWeek の値が範囲外（7）だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      blockedTimeSlots: [{ daysOfWeek: [7] as unknown as DayOfWeek[], start: '00:00', end: '06:00' }],
    }
    expect(validateGroup(g).some(e => e.field === 'blockedTimeSlots[0].daysOfWeek')).toBe(true)
  })

  it('daysOfWeek に重複があるとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      blockedTimeSlots: [{ daysOfWeek: [1, 1] as DayOfWeek[], start: '00:00', end: '06:00' }],
    }
    expect(validateGroup(g).some(e => e.field === 'blockedTimeSlots[0].daysOfWeek')).toBe(true)
  })

  it('特定曜日のみのブロック時間帯は valid', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'WeekdayBlock',
      blockedTimeSlots: [{ daysOfWeek: [1, 2, 3, 4, 5] as DayOfWeek[], start: '22:00', end: '06:00' }],
    }
    expect(validateGroup(g)).toEqual([])
  })
})

describe('validateTimeLimit (validateGroup 経由)', () => {
  it('正常な上限設定はエラーなし', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      timeLimits: [{ daysOfWeek: [1, 2, 3, 4, 5] as DayOfWeek[], dailyMinutes: 30 }],
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('dailyMinutes が 0 は valid（即ブロック）', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      timeLimits: [{ daysOfWeek: [] as DayOfWeek[], dailyMinutes: 0 }],
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('dailyMinutes が負数だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      timeLimits: [{ daysOfWeek: [] as DayOfWeek[], dailyMinutes: -1 }],
    }
    expect(validateGroup(g).some(e => e.field === 'timeLimits[0].dailyMinutes')).toBe(true)
  })

  it('dailyMinutes が小数だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      timeLimits: [{ daysOfWeek: [] as DayOfWeek[], dailyMinutes: 1.5 }],
    }
    expect(validateGroup(g).some(e => e.field === 'timeLimits[0].dailyMinutes')).toBe(true)
  })

  it('daysOfWeek の値が範囲外（7）だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      timeLimits: [{ daysOfWeek: [7] as unknown as DayOfWeek[], dailyMinutes: 30 }],
    }
    expect(validateGroup(g).some(e => e.field === 'timeLimits[0].daysOfWeek')).toBe(true)
  })

  it('daysOfWeek に重複があるとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      timeLimits: [{ daysOfWeek: [1, 1] as DayOfWeek[], dailyMinutes: 30 }],
    }
    expect(validateGroup(g).some(e => e.field === 'timeLimits[0].daysOfWeek')).toBe(true)
  })
})

describe('validateGlobalSettings', () => {
  it('正常な設定はエラーなし', () => {
    expect(validateGlobalSettings({
      blockAction: 'redirect',
      redirectUrl: 'https://example.com',
      dailyResetHour: '00:00',
    })).toEqual([])
  })

  it('無効 URL と HH:MM で2件のエラー', () => {
    const errors = validateGlobalSettings({
      blockAction: 'redirect',
      redirectUrl: 'not-a-url',
      dailyResetHour: '99:99',
    })
    expect(errors.some(e => e.field === 'redirectUrl')).toBe(true)
    expect(errors.some(e => e.field === 'dailyResetHour')).toBe(true)
  })

  it('redirectUrl が空でもエラー', () => {
    const errors = validateGlobalSettings({
      blockAction: 'redirect',
      redirectUrl: '',
      dailyResetHour: '00:00',
    })
    expect(errors.some(e => e.field === 'redirectUrl')).toBe(true)
  })

  it('blockedPage では redirectUrl が不正でも valid', () => {
    expect(validateGlobalSettings({
      blockAction: 'blockedPage',
      redirectUrl: '',
      dailyResetHour: '00:00',
    })).toEqual([])
  })

  it('blockAction が不正値だとエラー', () => {
    const errors = validateGlobalSettings({
      blockAction: 'invalid' as 'redirect',
      redirectUrl: 'https://example.com',
      dailyResetHour: '00:00',
    })
    expect(errors.some(e => e.field === 'blockAction')).toBe(true)
  })
})
