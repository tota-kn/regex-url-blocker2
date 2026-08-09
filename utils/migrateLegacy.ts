import {
  DEFAULT_SESSION_BREAK_MINUTES,
  DEFAULT_SESSION_LIMIT_MINUTES,
  DEFAULT_WAIT_GRANT_MINUTES,
} from './defaults'
import { sortRulesByEvaluationOrder } from './blocking'
import type { BlockDestination, Rule, RuleRestriction, TimeWindow } from './types'

/**
 * 旧フォーマット（`Group.restrictions`）の制限種別。
 * `Rule` へ移行済みのため、この形式は読み取り時の変換にのみ使う。
 */
export type LegacyRestrictionType = 'block' | 'redirect' | 'grace' | 'wait' | 'sessionLimit'

/**
 * 旧フォーマットの制限。時間条件とは独立に保存されており、`timeWindows` との直積で適用されていた。
 */
export interface LegacyRestriction {
  /** 制限種別。 */
  type: LegacyRestrictionType
  /** `type === 'grace'` のときの1日の閲覧上限分数。 */
  graceMinutes?: number
  /** `type === 'wait'` のときのアクセス前待機秒数。 */
  waitSeconds?: number
  /** `type === 'wait'` のとき、通過後にアクセスを許可する分数。 */
  waitGrantMinutes?: number
  /** `type === 'redirect'` のときの遷移先 URL。 */
  redirectUrl?: string
  /** `type === 'sessionLimit'` のとき、最初のアクセスから許可する分数。 */
  sessionMinutes?: number
  /** `type === 'sessionLimit'` のとき、利用枠後にブロックする休憩分数。 */
  breakMinutes?: number
}

/**
 * 旧フォーマットからの移行に必要な入力。
 */
export interface LegacyGroupInput {
  /** 移行対象グループの id。rule id の採番に使う。 */
  groupId: string
  /** 旧 `Group.timeWindows`。 */
  timeWindows: TimeWindow[]
  /** 旧 `Group.restrictions`。 */
  restrictions: LegacyRestriction[]
  /**
   * `restriction` 自身が遷移先を持たない場合に使う URL。
   * 呼び出し側が group の `blockAction` → global の `blockAction` の順に解決して渡す。
   * 未指定ならブロックページを使う。
   */
  fallbackRedirectUrl?: string
}

/**
 * 旧形式の制限内容を `RuleRestriction` へ変換する。
 * `redirect` は制限種別ではなく `block` の遷移先オプションへ畳む。
 */
function toRuleRestriction(restriction: LegacyRestriction): RuleRestriction {
  if (restriction.type === 'grace') {
    return { kind: 'dailyLimit', minutes: restriction.graceMinutes ?? 0 }
  }
  if (restriction.type === 'wait') {
    return {
      kind: 'wait',
      seconds: restriction.waitSeconds ?? 0,
      grantMinutes: restriction.waitGrantMinutes ?? DEFAULT_WAIT_GRANT_MINUTES,
    }
  }
  if (restriction.type === 'sessionLimit') {
    return {
      kind: 'sessionLimit',
      sessionMinutes: restriction.sessionMinutes ?? DEFAULT_SESSION_LIMIT_MINUTES,
      breakMinutes: restriction.breakMinutes ?? DEFAULT_SESSION_BREAK_MINUTES,
    }
  }
  return { kind: 'block' }
}

/**
 * 旧形式の3系統の遷移先（restriction の redirect → group.blockAction → global.blockAction）を
 * 1つの `BlockDestination` へ畳む。restriction 自身の URL が最優先。
 */
function toDestination(
  restriction: LegacyRestriction,
  input: LegacyGroupInput,
): BlockDestination | undefined {
  if (restriction.type === 'wait') return undefined
  const restrictionUrl = restriction.type === 'redirect' ? (restriction.redirectUrl ?? '') : ''
  const url = [restrictionUrl, input.fallbackRedirectUrl ?? ''].find(
    (candidate) => candidate.trim().length > 0,
  )
  return url ? { type: 'redirect', url } : { type: 'blockedPage' }
}

/**
 * 旧形式の `timeWindows` × `restrictions` を直積展開して `Rule[]` を作る。
 *
 * rule の id は `${groupId}:w{windowIndex}:r{restrictionIndex}` で**決定的**に採番する。
 * `getEffectiveGroupBlockStatus` と `getPendingEffectiveGroupIds` がグループの同一性を
 * `JSON.stringify` で判定するため、基準設定と最新設定が同じ内容から同じ id を得る必要がある。
 */
export function migrateLegacyRules(input: LegacyGroupInput): Rule[] {
  const rules = input.timeWindows.flatMap((window, windowIndex) =>
    input.restrictions.map((restriction, restrictionIndex) => {
      const destination = toDestination(restriction, input)
      return {
        id: `${input.groupId}:w${windowIndex}:r${restrictionIndex}`,
        window,
        restriction: toRuleRestriction(restriction),
        ...(destination ? { destination } : {}),
      } satisfies Rule
    }),
  )
  return sortRulesByEvaluationOrder(rules)
}
