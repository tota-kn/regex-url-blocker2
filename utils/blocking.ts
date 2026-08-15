import { getBlockReason, getEffectiveWait } from './groupStatus'
import { bothSettings } from './settingsPair'
import type { DelayGrantState, GroupPauseState, Settings, UsageCountersState } from './types'
import { getTargetGroupIds } from './urlTargeting'

/**
 * URL 判定の結果。
 */
export interface UrlEvaluation {
  /** URL がブロックされるなら true。 */
  blocked: boolean
  /** URL が制限対象として該当した group id。 */
  targetGroupIds: string[]
  /** ブロック状態だった group id。 */
  blockedGroupIds: string[]
  /** ハードブロックされていないが待機ゲートを課す group id。 */
  delayedGroupIds: string[]
}
/**
 * URL が現在ブロックされるかを評価する。
 */
export function evaluateUrl(
  settings: Settings,
  counters: UsageCountersState,
  url: string | undefined,
  now: Date,
): UrlEvaluation {
  const targetGroupIds = getTargetGroupIds(settings, url)
  const targetGroups = settings.groups.filter((group) => targetGroupIds.includes(group.id))
  const blockedGroupIds = targetGroups
    .filter(
      (group) =>
        getBlockReason(group, counters.counters[group.id], now, settings.global) !== undefined,
    )
    .map((group) => group.id)

  const delayedGroupIds = targetGroups
    .filter((group) => getEffectiveWait(group, now, settings.global) !== undefined)
    .map((group) => group.id)

  return {
    blocked: blockedGroupIds.length > 0,
    targetGroupIds,
    blockedGroupIds,
    delayedGroupIds,
  }
}

/**
 * rule day の基準設定と最新設定を独立評価し、制限が強い側の結果を合成する。
 */
export function evaluateEffectiveUrl(
  baseline: Settings,
  preferred: Settings,
  counters: UsageCountersState,
  url: string | undefined,
  now: Date,
): UrlEvaluation {
  // 評価は URL ごとに毎回走るため、設定 1 件につき 1 回だけ評価して結果を畳む。
  const evaluations = bothSettings({ baseline, preferred }).map((settings) =>
    evaluateUrl(settings, counters, url, now),
  )
  const unique = (pick: (item: UrlEvaluation) => string[]): string[] => [
    ...new Set(evaluations.flatMap(pick)),
  ]
  const blockedGroupIds = unique((item) => item.blockedGroupIds)
  return {
    blocked: blockedGroupIds.length > 0,
    targetGroupIds: unique((item) => item.targetGroupIds),
    blockedGroupIds,
    delayedGroupIds: unique((item) => item.delayedGroupIds),
  }
}
/**
 * 一時停止中のグループを、URL 評価結果のブロック対象と待機対象の両方から除外する。
 * Pause は「そのグループを一時的に無効にする」操作なので、待機ゲートも解除する。
 */
export function applyGroupPauseState(
  evaluation: UrlEvaluation,
  groupPauseState: GroupPauseState,
  now = Date.now(),
): UrlEvaluation {
  const isPaused = (groupId: string): boolean => {
    const pausedUntil = groupPauseState.groupPauseState[groupId]?.pausedUntil
    return typeof pausedUntil === 'number' && pausedUntil > now
  }
  const blockedGroupIds = evaluation.blockedGroupIds.filter((groupId) => !isPaused(groupId))
  return {
    ...evaluation,
    blocked: blockedGroupIds.length > 0,
    blockedGroupIds,
    delayedGroupIds: evaluation.delayedGroupIds.filter((groupId) => !isPaused(groupId)),
  }
}

/**
 * 待機ゲートを通過済みで許可期限内のグループを、URL 評価結果の待機対象から除外する。
 */
export function applyDelayGrantState(
  evaluation: UrlEvaluation,
  delayGrantState: DelayGrantState,
  now = Date.now(),
): UrlEvaluation {
  const delayedGroupIds = evaluation.delayedGroupIds.filter((groupId) => {
    const grantedUntil = delayGrantState.delayGrantState[groupId]?.grantedUntil
    return !(typeof grantedUntil === 'number' && grantedUntil > now)
  })
  return {
    ...evaluation,
    delayedGroupIds,
  }
}
