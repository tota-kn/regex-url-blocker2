import { dateAtMinuteOfDay, minuteOfDate } from './datetime'
import { getLogicalDate, matchesScheduleRuleCondition } from './logicalDate'
import type { GlobalSettings, Group, Rule, TimeRange, TimeWindow } from './types'

/** 時刻 T が時間帯に含まれるなら true。 */
export function timeInRange(nowMinute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return true
  if (startMinute < endMinute) return nowMinute >= startMinute && nowMinute < endMinute
  return nowMinute >= startMinute || nowMinute < endMinute
}

/** 現在有効な時間帯が次に解除される日時を返す。 */
export function getBlockedTimeRangeReleaseAt(range: TimeRange, now: Date): Date {
  const nowMinute = minuteOfDate(now)
  const releaseAt = dateAtMinuteOfDay(now, range.endMinute)
  if (range.startMinute === range.endMinute && releaseAt.getTime() <= now.getTime()) {
    releaseAt.setDate(releaseAt.getDate() + 1)
  } else if (range.startMinute > range.endMinute && nowMinute >= range.startMinute) {
    releaseAt.setDate(releaseAt.getDate() + 1)
  }
  return releaseAt
}

/** 時間ウィンドウが指定時刻に有効かを返す。 */
export function isWindowActiveAt(window: TimeWindow, at: Date, global: GlobalSettings): boolean {
  if (window.type === 'always') return true
  const info = getLogicalDate(at, global.dailyResetHour)
  if (!matchesScheduleRuleCondition(window.condition, info)) return false
  if (window.timeRanges.length === 0) return true
  const atMinute = minuteOfDate(at)
  return window.timeRanges.some((range) =>
    timeInRange(atMinute, range.startMinute, range.endMinute),
  )
}

/** 指定時刻に有効なルールだけを返す。 */
export function filterActiveRules(rules: Rule[], at: Date, global: GlobalSettings): Rule[] {
  return rules.filter((rule) => isWindowActiveAt(rule.window, at, global))
}

/** group の指定時刻に有効なルールだけを返す。 */
export function getActiveRules(group: Group, now: Date, global: GlobalSettings): Rule[] {
  return group.disabled ? [] : filterActiveRules(group.rules, now, global)
}

/** group に現在有効な制限ルールがあるなら true。 */
export function isRestrictionActiveNow(group: Group, now: Date, global: GlobalSettings): boolean {
  return getActiveRules(group, now, global).length > 0
}
