import { describe, expect, it } from 'vitest'
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
      dailyTimeLimitMinutes: 30,
      allowedHours: [{ start: '09:00', end: '18:00' }],
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('空 name・無効 pattern・負数 limit でそれぞれエラー', () => {
    const errors = validateGroup({
      id: 'x',
      name: '   ',
      patterns: ['['],
      dailyTimeLimitMinutes: -1,
      allowedHours: [],
    })
    expect(errors.some(e => e.field === 'name')).toBe(true)
    expect(errors.some(e => e.field === 'patterns[0]')).toBe(true)
    expect(errors.some(e => e.field === 'dailyTimeLimitMinutes')).toBe(true)
  })

  it('日跨ぎの許可時間帯（end <= start）は valid', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'NightOnly',
      allowedHours: [{ start: '22:00', end: '06:00' }],
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('許可時間帯の start/end が HH:MM 違反だとエラー', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'X',
      allowedHours: [{ start: '99:99', end: '06:00' }],
    }
    const errors = validateGroup(g)
    expect(errors.some(e => e.field === 'allowedHours[0].start')).toBe(true)
  })

  it('dailyTimeLimitMinutes が null は valid', () => {
    const g = { ...createEmptyGroup(), name: 'X', dailyTimeLimitMinutes: null }
    expect(validateGroup(g)).toEqual([])
  })
})

describe('validateGlobalSettings', () => {
  it('正常な設定はエラーなし', () => {
    expect(validateGlobalSettings({
      redirectUrl: 'https://example.com',
      dailyResetHour: '00:00',
    })).toEqual([])
  })

  it('無効 URL と HH:MM で2件のエラー', () => {
    const errors = validateGlobalSettings({
      redirectUrl: 'not-a-url',
      dailyResetHour: '99:99',
    })
    expect(errors.some(e => e.field === 'redirectUrl')).toBe(true)
    expect(errors.some(e => e.field === 'dailyResetHour')).toBe(true)
  })

  it('redirectUrl が空でもエラー', () => {
    const errors = validateGlobalSettings({
      redirectUrl: '',
      dailyResetHour: '00:00',
    })
    expect(errors.some(e => e.field === 'redirectUrl')).toBe(true)
  })
})
