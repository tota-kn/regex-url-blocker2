import { describe, expect, it } from 'vitest'
import {
  formatMonthDay,
  minutesToTime,
  parseDaysOfMonthText,
  parseMonthDayText,
  parseTimeRangeText,
  timeToMinutes,
} from '../utils/datetime'

describe('datetime utilities', () => {
  it('HH:MM と分を相互変換する', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('23:59')).toBe(1439)
    expect(timeToMinutes('24:00')).toBe(1440)
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(1439)).toBe('23:59')
    expect(minutesToTime(1440)).toBe('24:00')
  })

  it('カンマ区切りの時間帯テキストを解析する', () => {
    expect(parseTimeRangeText('09:00-12:30, 22:00-01:30')).toEqual([
      { startMinute: 540, endMinute: 750 },
      { startMinute: 1320, endMinute: 90 },
    ])
  })

  it('空文字を制限なしとして扱う', () => {
    expect(parseTimeRangeText('')).toEqual([])
  })

  it('カンマ区切りの日付テキストを毎月の日付配列へ解析する', () => {
    expect(parseDaysOfMonthText('1, 15')).toEqual([1, 15])
    expect(parseDaysOfMonthText('31,1,15,1')).toEqual([1, 15, 31])
    expect(parseDaysOfMonthText('')).toEqual([])
  })

  it('範囲外や数値以外の日付テキストは解析エラーにする', () => {
    expect(parseDaysOfMonthText('0')).toBeUndefined()
    expect(parseDaysOfMonthText('32')).toBeUndefined()
    expect(parseDaysOfMonthText('1, abc')).toBeUndefined()
  })

  it('MM/DD テキストと月日を相互変換する', () => {
    expect(parseMonthDayText('12/28')).toEqual({ month: 12, day: 28 })
    expect(parseMonthDayText('1/3')).toEqual({ month: 1, day: 3 })
    expect(formatMonthDay({ month: 1, day: 3 })).toBe('01/03')
  })

  it('範囲外や形式不正の MM/DD テキストは解析エラーにする', () => {
    expect(parseMonthDayText('13/01')).toBeUndefined()
    expect(parseMonthDayText('00/10')).toBeUndefined()
    expect(parseMonthDayText('01/32')).toBeUndefined()
    expect(parseMonthDayText('0110')).toBeUndefined()
  })
})
