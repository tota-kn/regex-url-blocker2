import { dayLabel, formatMonthDay, formatTimeRange } from './datetime'
import type { Group, RestrictionRule, ScheduleRuleCondition, Settings, TimeRange } from './types'

/**
 * グループを JSON 互換の deep clone として複製する。
 */
export function cloneGroup(group: Group): Group {
  const cloned = JSON.parse(JSON.stringify(group)) as Group
  if ((!cloned.restrictionRules || cloned.restrictionRules.length === 0) && cloned.restriction) {
    cloned.restrictionRules = [cloned.restriction]
    cloned.restriction = undefined
  }
  return cloned
}

/**
 * 設定値を JSON 互換の deep clone として複製する。
 */
export function cloneSettings(settings: Settings): Settings {
  return JSON.parse(JSON.stringify(settings)) as Settings
}

/**
 * URL pattern mode の保存値を読み取り表示用の文言に変換する。
 */
export function formatGroupMode(group: Group): string {
  return group.mode === 'whitelist' ? 'Allow only matches' : 'Block matches'
}

/**
 * グループ単位のブロック遷移先を読み取り表示用の文言に変換する。
 */
export function formatBlockDestination(group: Group): string {
  return group.blockAction === 'redirect' ? `Redirect to ${group.redirectUrl}` : 'Blocked page'
}

/**
 * スケジュールルールの適用条件を読み取り表示用の文言に変換する。
 */
export function formatScheduleRuleCondition(condition: ScheduleRuleCondition): string {
  if (condition.type === 'weekly') {
    return `Weekly ${condition.daysOfWeek.map(dayLabel).join(', ')}`
  }
  if (condition.type === 'monthly') {
    return `Monthly ${condition.daysOfMonth.join(', ')}`
  }
  if (condition.type === 'period') {
    return `${formatMonthDay(condition.start)}-${formatMonthDay(condition.end)}`
  }
  return 'Every day'
}

/**
 * 制限が有効な時刻ウィンドウを読み取り表示用の文言に変換する。
 */
function formatRestrictionWindow(timeRanges: TimeRange[]): string {
  return timeRanges.length > 0 ? timeRanges.map(formatTimeRange).join(', ') : 'All day'
}

/**
 * 読み取り専用表示用にグループの単一制限を要約する。
 */
export function formatRestriction(restriction: RestrictionRule): string {
  const detail = restriction.type === 'block'
    ? 'Block'
    : restriction.type === 'grace'
      ? `Grace ${restriction.graceMinutes ?? 0} min/day`
      : `Wait ${restriction.waitSeconds ?? 0} sec`
  return `${formatScheduleRuleCondition(restriction.condition)} ${formatRestrictionWindow(restriction.timeRanges)} — ${detail}`
}
