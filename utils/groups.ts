import { dayLabel, formatMonthDay, formatTimeRange } from './datetime'
import type {
  Group,
  Restriction,
  ScheduleRuleCondition,
  Settings,
  TimeRange,
  TimeWindow,
} from './types'

/**
 * グループを JSON 互換の deep clone として複製する。
 */
export function cloneGroup(group: Group): Group {
  const cloned = JSON.parse(JSON.stringify(group)) as Group
  return cloned
}

/**
 * 保存済みグループから、新規編集用の独立した複製値を作る。
 */
export function duplicateGroup(group: Group): Group {
  return {
    ...cloneGroup(group),
    id: crypto.randomUUID(),
    name: `${group.name} copy`,
  }
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

/** 時間ウィンドウを読み取り表示用の文言に変換する。 */
export function formatTimeWindow(window: TimeWindow): string {
  if (window.type === 'always') return 'Always'
  return `${formatScheduleRuleCondition(window.condition)} ${formatRestrictionWindow(window.timeRanges)}`
}

/** 分離形式の制限を読み取り表示用の文言に変換する。 */
export function formatStandaloneRestriction(restriction: Restriction): string {
  if (restriction.type === 'block') return 'Block'
  if (restriction.type === 'redirect')
    return restriction.redirectUrl ? `Redirect to ${restriction.redirectUrl}` : 'Redirect'
  if (restriction.type === 'grace') return `Grace ${restriction.graceMinutes ?? 0} min/day`
  return `Wait ${restriction.waitSeconds ?? 0} sec, allow ${restriction.waitGrantMinutes ?? 10} min`
}
