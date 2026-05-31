import { formatTimeRange } from './datetime'
import type { DailyRule, Group, Settings } from './types'

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
 * 読み取り専用表示用に曜日別ルールを要約する。
 */
export function formatDailyRule(rule: DailyRule): string {
  const ranges = rule.blockedTimeRanges.length > 0
    ? rule.blockedTimeRanges.map(formatTimeRange).join(', ')
    : 'No blocked time'
  const limit = rule.dailyLimitMinutes === undefined ? 'No limit' : `${rule.dailyLimitMinutes} min`
  return `Blocked time: ${ranges}; Daily limit: ${limit}`
}
