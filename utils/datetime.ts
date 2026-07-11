import type { DayOfWeek, MonthDay, TimeRange } from './types'

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
 * 曜日番号の短縮ラベルを返す。
 */
export function dayLabel(dayOfWeek: DayOfWeek): string {
  return DAYS.find((day) => day.value === dayOfWeek)?.label ?? String(dayOfWeek)
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
 * カンマ区切りの日付テキスト（例 "1, 15"）を毎月の日付配列へ解析する。
 * 空文字は空配列、1-31 の整数以外を含む場合は undefined を返す。
 */
export function parseDaysOfMonthText(text: string): number[] | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return []

  const days: number[] = []
  for (const part of trimmed.split(',')) {
    const match = /^\s*(\d{1,2})\s*$/.exec(part)
    if (!match) return undefined

    const day = Number(match[1])
    if (day < 1 || day > 31) return undefined
    if (!days.includes(day)) days.push(day)
  }

  return days.toSorted((a, b) => a - b)
}

/**
 * "MM/DD" 形式のテキストを月日へ解析する。月 1-12・日 1-31 の範囲外は undefined を返す。
 */
export function parseMonthDayText(text: string): MonthDay | undefined {
  const match = /^\s*(\d{1,2})\/(\d{1,2})\s*$/.exec(text)
  if (!match) return undefined

  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return { month, day }
}

/**
 * 月日を "MM/DD" 形式のテキストへ変換する。
 */
export function formatMonthDay(monthDay: MonthDay): string {
  return `${String(monthDay.month).padStart(2, '0')}/${String(monthDay.day).padStart(2, '0')}`
}
