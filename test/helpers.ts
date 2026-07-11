import type { DayOfWeek, Group, RestrictionRule, RestrictionType } from '../utils/types'
import { createGroupFromTemplate } from '../utils/defaults'

/**
 * テスト用に空の新規グループを生成する。`id` は crypto.randomUUID() で採番。
 * @param name グループ名。省略時は空文字。
 */
export function createEmptyGroup(name = ''): Group {
  return createGroupFromTemplate('blank', name)
}

/**
 * テスト用に毎日条件の単一制限を生成する。
 */
export function dailyRestriction(type: RestrictionType, overrides: Partial<Omit<RestrictionRule, 'condition' | 'type'>> = {}): RestrictionRule {
  return {
    condition: { type: 'daily' },
    timeRanges: [],
    type,
    ...overrides,
  }
}

/**
 * テスト用に毎週条件の単一制限を生成する。
 */
export function weeklyRestriction(daysOfWeek: DayOfWeek[], type: RestrictionType, overrides: Partial<Omit<RestrictionRule, 'condition' | 'type'>> = {}): RestrictionRule {
  return {
    condition: { type: 'weekly', daysOfWeek },
    timeRanges: [],
    type,
    ...overrides,
  }
}
