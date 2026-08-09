import type { DayOfWeek, Group, Rule, RuleRestriction, TimeRange } from '../utils/types'
import { createGroupFromTemplate } from '../utils/defaults'

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
function buildRule(
  window: Rule['window'],
  restriction: RuleRestriction,
  overrides: RuleOverrides,
): Rule {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    window,
    restriction,
    ...(restriction.kind === 'wait'
      ? {}
      : {
          destination: overrides.redirectUrl
            ? ({ type: 'redirect', url: overrides.redirectUrl } as const)
            : ({ type: 'blockedPage' } as const),
        }),
  }
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

/** 複数のルール断片を1グループへまとめる。 */
export function rules(...parts: Pick<Group, 'rules'>[]): Pick<Group, 'rules'> {
  return { rules: parts.flatMap((part) => part.rules) }
}
