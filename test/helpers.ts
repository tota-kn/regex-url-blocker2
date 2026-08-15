import type {
  DayOfWeek,
  GlobalSettings,
  Group,
  Rule,
  RuleRestriction,
  Settings,
  TimeRange,
  UsageCountersState,
} from '../utils/types'
import { createGroupFromTemplate, DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import { buildRule as createRule } from '../utils/ruleFactory'

/** テスト用の標準グループを生成する。 */
export function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Group',
    mode: 'blacklist',
    disabled: false,
    lockMode: false,
    patterns: ['example\\.com'],
    pauseAllowed: true,
    rules: [],
    ...overrides,
    pauseWaitSeconds: overrides.pauseWaitSeconds ?? 60,
    pauseDurationMinutes: overrides.pauseDurationMinutes ?? 10,
  }
}

/** テスト用の標準設定を生成する。 */
export function settings(groups: Group[], global: Partial<GlobalSettings> | string = {}): Settings {
  const overrides = typeof global === 'string' ? { dailyResetHour: global } : global
  return { global: { ...DEFAULT_GLOBAL_SETTINGS, dailyResetHour: '00:00', ...overrides }, groups }
}

/** グループ別消費秒からテスト用カウンタ状態を生成する。 */
export function counters(
  consumedSecByGroupId: Record<string, number>,
  logicalDate: string,
): UsageCountersState {
  return {
    counters: Object.fromEntries(
      Object.entries(consumedSecByGroupId).map(([groupId, consumedSec]) => [
        groupId,
        { logicalDate, consumedSec },
      ]),
    ),
  }
}

/**
 * テスト用に空の新規グループを生成する。`id` は crypto.randomUUID() で採番。
 * @param name グループ名。省略時は空文字。
 */
export function createEmptyGroup(name = ''): Group {
  return createGroupFromTemplate('blank', name)
}

/** ルールヘルパーで指定できる時間ウィンドウの上書き値。 */
interface RuleOverrides {
  /** ルールが有効な時刻ウィンドウ。省略時は終日。 */
  timeRanges?: TimeRange[]
  /** ブロック時の遷移先 URL。省略時はブロックページ。 */
  redirectUrl?: string
  /** rule id。省略時は自動採番。 */
  id?: string
}

/** 制限内容と条件から1件のルールを組み立てる。 */
export function buildRule(
  window: Rule['window'],
  restriction: RuleRestriction,
  overrides: RuleOverrides,
): Rule {
  return createRule(
    overrides.id ?? crypto.randomUUID(),
    window,
    restriction,
    overrides.redirectUrl
      ? { type: 'redirect', url: overrides.redirectUrl }
      : { type: 'blockedPage' },
  )
}

/**
 * テスト用に毎日条件のルールを1件生成し、グループへ spread できる形で返す。
 */
export function dailyRule(
  restriction: RuleRestriction,
  overrides: RuleOverrides = {},
): Pick<Group, 'rules'> {
  const timeRanges = overrides.timeRanges ?? []
  const window: Rule['window'] =
    timeRanges.length === 0
      ? { type: 'always' }
      : { type: 'scheduled', condition: { type: 'daily' }, timeRanges }
  return { rules: [buildRule(window, restriction, overrides)] }
}

/**
 * テスト用に毎週条件のルールを1件生成し、グループへ spread できる形で返す。
 */
export function weeklyRule(
  daysOfWeek: DayOfWeek[],
  restriction: RuleRestriction,
  overrides: RuleOverrides = {},
): Pick<Group, 'rules'> {
  return {
    rules: [
      buildRule(
        {
          type: 'scheduled',
          condition: { type: 'weekly', daysOfWeek },
          timeRanges: overrides.timeRanges ?? [],
        },
        restriction,
        overrides,
      ),
    ],
  }
}
