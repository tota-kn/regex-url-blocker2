import { asRecord } from './record'
import type { DayOfWeek, MonthDay, ScheduleRuleCondition, TimeRange, TimeWindow } from './types'

/**
 * storage から読んだ `unknown` を、時間条件まわりの型付き値へ正規化する。
 *
 * 現行スキーマの読み込み（`storage.ts`）と旧フォーマットからの移行（`migrateLegacy.ts`）の
 * 両方が使うため、どちらにも依存しない独立モジュールに置く。
 *
 * 数値が読めない場合は例外にせず `-1` のような **`validation.ts` が必ず弾く値** を入れる。
 * 壊れた保存値でも設定画面を開けるようにし、エラー表示で気づけるようにするため。
 */

/**
 * unknown の値から分単位の時間帯を生成する。
 */
export function normalizeTimeRange(value: unknown): TimeRange {
  const range = asRecord(value)
  return {
    startMinute: typeof range.startMinute === 'number' ? range.startMinute : -1,
    endMinute: typeof range.endMinute === 'number' ? range.endMinute : -1,
  }
}

/**
 * unknown の値から月日を生成する。数値以外は -1（validation で拒否される値）にする。
 */
export function normalizeMonthDay(value: unknown): MonthDay {
  const monthDay = asRecord(value)
  return {
    month: typeof monthDay.month === 'number' ? monthDay.month : -1,
    day: typeof monthDay.day === 'number' ? monthDay.day : -1,
  }
}

/**
 * unknown の値からスケジュールルールの条件を生成する。既知の type 以外は undefined を返す。
 */
export function normalizeScheduleRuleCondition(value: unknown): ScheduleRuleCondition | undefined {
  const condition = asRecord(value)
  if (condition.type === 'daily') {
    return { type: 'daily' }
  }
  if (condition.type === 'weekly') {
    return {
      type: 'weekly',
      daysOfWeek: Array.isArray(condition.daysOfWeek)
        ? condition.daysOfWeek.filter((day): day is DayOfWeek => Number.isInteger(day))
        : [],
    }
  }
  if (condition.type === 'monthly') {
    return {
      type: 'monthly',
      daysOfMonth: Array.isArray(condition.daysOfMonth)
        ? condition.daysOfMonth.filter((day): day is number => Number.isInteger(day))
        : [],
    }
  }
  if (condition.type === 'period') {
    return {
      type: 'period',
      start: normalizeMonthDay(condition.start),
      end: normalizeMonthDay(condition.end),
    }
  }
  return undefined
}

/**
 * unknown の値から時間ウィンドウ配列を生成する。
 * 配列でなければ undefined を返し、呼び出し側が旧フォーマットへフォールバックできるようにする。
 */
export function normalizeTimeWindows(value: unknown): TimeWindow[] | undefined {
  if (!Array.isArray(value)) return undefined
  const windows: TimeWindow[] = []
  value.forEach((item) => {
    const window = asRecord(item)
    if (window.type === 'always') {
      windows.push({ type: 'always' })
      return
    }
    if (window.type !== 'scheduled') return
    const condition = normalizeScheduleRuleCondition(window.condition)
    if (condition)
      windows.push({
        type: 'scheduled',
        condition,
        timeRanges: Array.isArray(window.timeRanges)
          ? window.timeRanges.map(normalizeTimeRange)
          : [],
      })
  })
  return windows
}

/**
 * スケジュール条件と時間帯の組を時間ウィンドウへ変換する。毎日かつ時間帯なしは常時ウィンドウにする。
 */
export function toTimeWindow(
  condition: ScheduleRuleCondition,
  timeRanges: TimeRange[],
): TimeWindow {
  return condition.type === 'daily' && timeRanges.length === 0
    ? { type: 'always' }
    : { type: 'scheduled', condition, timeRanges }
}
