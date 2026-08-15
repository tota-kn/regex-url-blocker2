import type { HHMM } from '../utils/types'

/** 指定リセット時刻における現在の論理日 ID を返す。 */
export function logicalDateId(now: Date, dailyResetHour: HHMM): string {
  const [hour = '0', minute = '0'] = dailyResetHour.split(':')
  const reset = new Date(now)
  reset.setHours(Number(hour), Number(minute), 0, 0)
  if (now.getTime() < reset.getTime()) reset.setDate(reset.getDate() - 1)
  return [
    reset.getFullYear(),
    String(reset.getMonth() + 1).padStart(2, '0'),
    String(reset.getDate()).padStart(2, '0'),
  ].join('-')
}
