import type { DailyRule, DayOfWeek, GlobalSettings, Group } from './types'

/**
 * 未設定時に使用するグローバル設定の既定値。SPEC.md 準拠。
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  blockAction: 'redirect',
  redirectUrl: 'https://example.com',
  dailyResetHour: '00:00',
  notificationThresholdMinutes: 5,
}

/**
 * 曜日別ルールを空の状態で7件生成する。
 */
export function createEmptyDailyRules(): DailyRule[] {
  return ([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map(dayOfWeek => ({
    dayOfWeek,
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
  }))
}

/**
 * 新規グループを生成する。`id` は crypto.randomUUID() で採番。
 * @param name グループ名。省略時は空文字。
 */
export function createEmptyGroup(name = ''): Group {
  return {
    id: crypto.randomUUID(),
    name,
    mode: 'blacklist',
    patterns: [],
    dailyRules: createEmptyDailyRules(),
  }
}
