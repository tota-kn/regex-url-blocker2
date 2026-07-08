import type { DayOfWeek, Group, ScheduleRule } from '../utils/types'
import { createGroupFromTemplate } from '../utils/defaults'

/**
 * テスト用に空の新規グループを生成する。`id` は crypto.randomUUID() で採番。
 * @param name グループ名。省略時は空文字。
 */
export function createEmptyGroup(name = ''): Group {
  return createGroupFromTemplate('blank', name)
}

/**
 * テスト用に毎日条件のスケジュールルールを1件だけ持つ配列を生成する。
 */
export function dailyScheduleRules(override: Partial<Pick<ScheduleRule, 'blockedTimeRanges' | 'dailyLimitMinutes'>> = {}): ScheduleRule[] {
  return [{
    id: 'daily-rule',
    condition: { type: 'daily' },
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
    ...override,
  }]
}

/**
 * テスト用に毎週条件のスケジュールルールを1件だけ持つ配列を生成する。
 */
export function weeklyScheduleRules(daysOfWeek: DayOfWeek[], override: Partial<Pick<ScheduleRule, 'blockedTimeRanges' | 'dailyLimitMinutes'>> = {}): ScheduleRule[] {
  return [{
    id: 'weekly-rule',
    condition: { type: 'weekly', daysOfWeek },
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
    ...override,
  }]
}
