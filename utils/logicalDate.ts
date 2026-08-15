import { dateAtMinuteOfDay, formatDate, minuteOfDay } from './datetime'
import type { DayOfWeek, GlobalSettings, ScheduleRuleCondition, TimeWindow } from './types'

/** 論理日と、その開始時点の暦情報。 */
export interface LogicalDateInfo {
  logicalDate: string
  dayOfWeek: DayOfWeek
  month: number
  dayOfMonth: number
}

/** グローバル設定のリセット時刻を起点にした論理日情報を返す。 */
export function getLogicalDate(now: Date, dailyResetHour: string): LogicalDateInfo {
  const start = dateAtMinuteOfDay(now, minuteOfDay(dailyResetHour))
  if (now.getTime() < start.getTime()) start.setDate(start.getDate() - 1)
  return {
    logicalDate: formatDate(start),
    dayOfWeek: start.getDay() as DayOfWeek,
    month: start.getMonth() + 1,
    dayOfMonth: start.getDate(),
  }
}

/** 次の daily reset 到来日時を返す。 */
export function getNextDailyResetAt(now: Date, global: GlobalSettings): Date {
  const resetAt = dateAtMinuteOfDay(now, minuteOfDay(global.dailyResetHour))
  if (resetAt.getTime() <= now.getTime()) resetAt.setDate(resetAt.getDate() + 1)
  return resetAt
}

/** 月日を比較可能な数値キーへ変換する。 */
function monthDayKey(month: number, day: number): number {
  return month * 100 + day
}

/** スケジュール条件が指定論理日に一致するなら true。 */
export function matchesScheduleRuleCondition(
  condition: ScheduleRuleCondition,
  info: LogicalDateInfo,
): boolean {
  if (condition.type === 'weekly') return condition.daysOfWeek.includes(info.dayOfWeek)
  if (condition.type === 'monthly') return condition.daysOfMonth.includes(info.dayOfMonth)
  if (condition.type === 'period') {
    const start = monthDayKey(condition.start.month, condition.start.day)
    const end = monthDayKey(condition.end.month, condition.end.day)
    const key = monthDayKey(info.month, info.dayOfMonth)
    return start <= end ? key >= start && key <= end : key >= start || key <= end
  }
  return true
}

/** 時間ウィンドウの適用日条件が指定論理日に一致するなら true。 */
export function windowMatchesLogicalDate(window: TimeWindow, info: LogicalDateInfo): boolean {
  return window.type === 'always' || matchesScheduleRuleCondition(window.condition, info)
}
