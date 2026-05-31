import type { DayOfWeek, TimeRange } from './types'

/**
 * 曜日表示に使う短縮名とアクセシブル名。
 */
export interface DayOption {
  /** JS Date 互換の曜日番号。 */
  value: DayOfWeek
  /** 画面上の短い曜日名。 */
  label: string
  /** aria-label 用の曜日名。 */
  ariaLabel: string
}

/**
 * UI と読み取り表示で共通利用する曜日表示定義。
 */
export const DAYS: DayOption[] = [
  { value: 0, label: 'Sun', ariaLabel: 'Sunday' },
  { value: 1, label: 'Mon', ariaLabel: 'Monday' },
  { value: 2, label: 'Tue', ariaLabel: 'Tuesday' },
  { value: 3, label: 'Wed', ariaLabel: 'Wednesday' },
  { value: 4, label: 'Thu', ariaLabel: 'Thursday' },
  { value: 5, label: 'Fri', ariaLabel: 'Friday' },
  { value: 6, label: 'Sat', ariaLabel: 'Saturday' },
]

/**
 * 30分刻みのセル番号を返す。
 */
export const HALF_HOUR_CELLS = Array.from({ length: 48 }, (_, index) => index)

/**
 * 曜日ごとの値を持つ record を作成する。
 */
export function createDayRecord<T>(createValue: () => T): Record<DayOfWeek, T> {
  return {
    0: createValue(),
    1: createValue(),
    2: createValue(),
    3: createValue(),
    4: createValue(),
    5: createValue(),
    6: createValue(),
  }
}

/**
 * 曜日番号の短縮ラベルを返す。
 */
export function dayLabel(dayOfWeek: DayOfWeek): string {
  return DAYS.find(day => day.value === dayOfWeek)?.label ?? String(dayOfWeek)
}

/**
 * "HH:MM" 文字列を分へ変換する。24:00 は 1440 として扱う。
 */
export function timeToMinutes(time: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return undefined

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined
  if (hours === 24 && minutes === 0) return 1440
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined
  return hours * 60 + minutes
}

/**
 * 分を "HH:MM" 文字列へ変換する。1440 は 24:00 として表示する。
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/**
 * 日時を YYYY-MM-DD HH:MM で表示する。
 */
export function formatDateTime(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

/**
 * ブロック時間帯を読み取り表示用の文字列に変換する。
 */
export function formatTimeRange(range: TimeRange): string {
  if (range.startMinute === range.endMinute) return 'All day'
  return `${minutesToTime(range.startMinute)}-${minutesToTime(range.endMinute)}`
}

/**
 * カンマ区切りの "HH:MM-HH:MM" 時間帯テキストを解析する。
 */
export function parseTimeRangeText(text: string): TimeRange[] | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return []

  const ranges: TimeRange[] = []
  for (const part of trimmed.split(',')) {
    const match = /^\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/.exec(part)
    if (!match) return undefined

    const start = timeToMinutes(match[1])
    const end = timeToMinutes(match[2])
    if (start === undefined || end === undefined) return undefined
    ranges.push({ startMinute: start, endMinute: end })
  }

  return ranges
}

/**
 * 時間帯範囲に少しでも重なる30分セル番号の配列を返す。
 */
export function rangeToOverlappingCells(range: TimeRange): number[] {
  if (range.startMinute === range.endMinute) return [...HALF_HOUR_CELLS]

  const ranges = range.endMinute > range.startMinute
    ? [range]
    : [
        { startMinute: range.startMinute, endMinute: 1440 },
        { startMinute: 0, endMinute: range.endMinute },
      ]

  return HALF_HOUR_CELLS.filter((index) => {
    const cellStart = index * 30
    const cellEnd = cellStart + 30
    return ranges.some(current => current.startMinute < cellEnd && current.endMinute > cellStart)
  })
}

/**
 * 選択済みセルをカンマ区切りの時間帯テキストへ変換する。
 */
export function selectedCellsToRangeText(cells: boolean[]): string {
  const ranges: string[] = []
  let start: number | undefined

  for (let index = 0; index <= cells.length; index += 1) {
    if (cells[index]) {
      start ??= index
      continue
    }
    if (start === undefined) continue

    ranges.push(`${minutesToTime(start * 30)}-${minutesToTime(index * 30)}`)
    start = undefined
  }

  return ranges.join(', ')
}

/**
 * 選択済みセルを保存用の分単位時間帯へ変換する。
 */
export function cellsToRanges(cells: boolean[]): TimeRange[] {
  const ranges: TimeRange[] = []
  let start: number | undefined

  for (let index = 0; index <= cells.length; index += 1) {
    if (cells[index]) {
      start ??= index
      continue
    }
    if (start === undefined) continue

    ranges.push({ startMinute: start * 30, endMinute: index * 30 })
    start = undefined
  }

  return ranges
}
