import { dayLabel, formatMonthDay, formatTimeRange } from './datetime'
import type { Group, ScheduleRule, ScheduleRuleCondition, Settings } from './types'

/**
 * グループを JSON 互換の deep clone として複製する。
 */
export function cloneGroup(group: Group): Group {
  return JSON.parse(JSON.stringify(group)) as Group
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
 * 読み取り専用表示用にスケジュールルールを要約する。
 */
export function formatScheduleRule(rule: ScheduleRule): string {
  const ranges = rule.blockedTimeRanges.length > 0
    ? rule.blockedTimeRanges.map(formatTimeRange).join(', ')
    : 'No blocked hours'
  const limit = rule.dailyLimitMinutes === undefined ? 'No daily limit' : `${rule.dailyLimitMinutes} min/day`
  return `${formatScheduleRuleCondition(rule.condition)} — Blocked hours: ${ranges}; Daily limit: ${limit}`
}
