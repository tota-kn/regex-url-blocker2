import { dateAtMinuteOfDay, formatDate, minuteOfDay } from './datetime'
import type { DayOfWeek } from './types'

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
