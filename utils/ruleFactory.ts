import type {
  BlockDestination,
  BlockingRule,
  Rule,
  RuleRestriction,
  TimeWindow,
  WaitRule,
} from '@/utils/types'

/** 制限内容から、遷移先の不変条件を満たすルールを生成する。 */
export function buildRule(
  id: string,
  window: TimeWindow,
  restriction: RuleRestriction,
  destination: BlockDestination = { type: 'blockedPage' },
): Rule {
  if (restriction.kind === 'wait') return { id, window, restriction }
  return { id, window, restriction, destination }
}

/** ルールがブロック遷移先を持つ種別か判定する。 */
export function isBlockingRule(rule: Rule): rule is BlockingRule {
  return rule.restriction.kind !== 'wait'
}

/** ルールが待機ゲート種別か判定する。 */
export function isWaitRule(rule: Rule): rule is WaitRule {
  return rule.restriction.kind === 'wait'
}
