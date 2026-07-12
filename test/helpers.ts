import type {
  DayOfWeek,
  Group,
  Restriction,
  RestrictionType,
  ScheduleRuleCondition,
  TimeRange,
} from '../utils/types'
import { createGroupFromTemplate } from '../utils/defaults'

/**
 * テスト用に空の新規グループを生成する。`id` は crypto.randomUUID() で採番。
 * @param name グループ名。省略時は空文字。
 */
export function createEmptyGroup(name = ''): Group {
  return createGroupFromTemplate('blank', name)
}

/**
 * 制限ヘルパーで指定できる制限内容の上書き値。
 */
interface RestrictionOverrides {
  /** 制限が有効な時刻ウィンドウ。省略時は終日。 */
  timeRanges?: TimeRange[]
  /** `type === 'grace'` のときの1日の閲覧上限分数。 */
  graceMinutes?: number
  /** `type === 'wait'` のときのアクセス前待機秒数。 */
  waitSeconds?: number
  /** `type === 'wait'` のとき、通過後にアクセスを許可する分数。 */
  waitGrantMinutes?: number
}

/**
 * スケジュール条件と制限内容から、グループへ spread できる分離形式
 * （`timeWindows` + `restrictions`）を1組生成する。
 */
function restrictionParts(
  condition: ScheduleRuleCondition,
  type: RestrictionType,
  overrides: RestrictionOverrides,
): Pick<Group, 'timeWindows' | 'restrictions'> {
  const timeRanges = overrides.timeRanges ?? []
  const restriction: Restriction = { type }
  if (overrides.graceMinutes !== undefined) restriction.graceMinutes = overrides.graceMinutes
  if (overrides.waitSeconds !== undefined) restriction.waitSeconds = overrides.waitSeconds
  if (overrides.waitGrantMinutes !== undefined)
    restriction.waitGrantMinutes = overrides.waitGrantMinutes
  return {
    timeWindows: [
      condition.type === 'daily' && timeRanges.length === 0
        ? { type: 'always' }
        : { type: 'scheduled', condition, timeRanges },
    ],
    restrictions: [restriction],
  }
}

/**
 * テスト用に毎日条件の単一制限（分離形式）を生成する。
 */
export function dailyRestriction(
  type: RestrictionType,
  overrides: RestrictionOverrides = {},
): Pick<Group, 'timeWindows' | 'restrictions'> {
  return restrictionParts({ type: 'daily' }, type, overrides)
}

/**
 * テスト用に毎週条件の単一制限（分離形式）を生成する。
 */
export function weeklyRestriction(
  daysOfWeek: DayOfWeek[],
  type: RestrictionType,
  overrides: RestrictionOverrides = {},
): Pick<Group, 'timeWindows' | 'restrictions'> {
  return restrictionParts({ type: 'weekly', daysOfWeek }, type, overrides)
}
