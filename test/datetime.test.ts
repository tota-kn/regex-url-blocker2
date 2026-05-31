import { describe, expect, it } from 'vitest'
import {
  cellsToRanges,
  minutesToTime,
  parseTimeRangeText,
  rangeToOverlappingCells,
  selectedCellsToRangeText,
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

  it('日跨ぎ範囲を30分セルへ反映する', () => {
    const cells = rangeToOverlappingCells({ startMinute: 1320, endMinute: 90 })

    expect(cells).toEqual([0, 1, 2, 44, 45, 46, 47])
  })

  it('24時間範囲を30分セルへ反映し、セルから保存形式へ戻す', () => {
    const cells = rangeToOverlappingCells({ startMinute: 0, endMinute: 0 })

    expect(cells).toHaveLength(48)
    expect(selectedCellsToRangeText(cells.map(() => true))).toBe('00:00-24:00')
    expect(cellsToRanges(cells.map(() => true))).toEqual([{ startMinute: 0, endMinute: 1440 }])
  })
})
