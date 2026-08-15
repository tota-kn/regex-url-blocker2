import { dayLabel, formatMonthDay, formatTimeRange } from './datetime'
import { deepClone } from './json'
import type { Group, ScheduleRuleCondition, Settings, TimeRange, TimeWindow } from './types'

/**
 * グループを JSON 互換の deep clone として複製する。
 */
export function cloneGroup(group: Group): Group {
  return deepClone(group)
}

/**
 * 保存済みグループから、新規編集用の独立した複製値を作る。
 * ルール id も採番し直し、複製元と共有しないようにする。
 */
export function duplicateGroup(group: Group): Group {
  const cloned = cloneGroup(group)
  return {
    ...cloned,
    id: crypto.randomUUID(),
    name: `${group.name} copy`,
    rules: cloned.rules.map((rule) => ({ ...rule, id: crypto.randomUUID() })),
  }
}

/**
 * 基準スナップショットのグループを、保存設定のグループ配列へ復元した新しい配列を返す。
 * 同じ id のグループが既にあるときは復元せず、内容の等しい新しい配列を返す。
 */
export function restoreGroupToList(groups: Group[], restored: Group): Group[] {
  if (groups.some((group) => group.id === restored.id)) return [...groups]
  return [...groups, cloneGroup(restored)]
}

/**
 * 設定値を JSON 互換の deep clone として複製する。
 */
export function cloneSettings(settings: Settings): Settings {
  return deepClone(settings)
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
 * ルールが有効な時刻ウィンドウを読み取り表示用の文言に変換する。
 */
function formatRestrictionWindow(timeRanges: TimeRange[]): string {
  return timeRanges.length > 0 ? timeRanges.map(formatTimeRange).join(', ') : 'All day'
}

/** 時間ウィンドウを読み取り表示用の文言に変換する。 */
export function formatTimeWindow(window: TimeWindow): string {
  if (window.type === 'always') return 'Always'
  return `${formatScheduleRuleCondition(window.condition)} ${formatRestrictionWindow(window.timeRanges)}`
}
