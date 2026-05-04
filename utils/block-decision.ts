import type { Accumulator, AccumulatorMap, Group, GroupBlockDecision, UrlBlockDecision } from '@/utils/types'
import { isWithinAllowedHours } from '@/utils/time-of-day'
import { compilePatterns, matchesAny, shouldSkipUrl } from '@/utils/regex-match'

/**
 * グループ単位のブロック判定を行う。
 * 許可時間帯外 OR 累積消費が上限以上 のとき blocked:true を返す。
 */
export function decideGroupBlock(
  group: Group,
  accumulator: Accumulator | undefined,
  now: Date,
): GroupBlockDecision {
  if (group.allowedHours.length > 0 && !isWithinAllowedHours(now, group.allowedHours)) {
    return { blocked: true, reason: 'time-of-day' }
  }

  if (group.dailyTimeLimitMinutes !== null) {
    const consumedSec = accumulator?.consumedSec ?? 0
    if (consumedSec >= group.dailyTimeLimitMinutes * 60) {
      return { blocked: true, reason: 'daily-limit' }
    }
  }

  return { blocked: false }
}

/**
 * URL 単位のブロック判定を行う。
 * マッチするグループのうち1つでもブロック状態なら blocked:true を返す。
 * shouldSkipUrl が true の URL は常に blocked:false。
 */
export function decideUrlBlock(
  url: string,
  groups: Group[],
  accumulators: AccumulatorMap,
  now: Date,
  redirectUrl: string,
): UrlBlockDecision {
  if (shouldSkipUrl(url, redirectUrl)) {
    return { blocked: false, matchingGroupIds: [], blockingGroupIds: [] }
  }

  const matchingGroupIds: string[] = []
  const blockingGroupIds: string[] = []

  for (const group of groups) {
    const compiled = compilePatterns(group.patterns)
    if (!matchesAny(url, compiled)) continue
    matchingGroupIds.push(group.id)
    const decision = decideGroupBlock(group, accumulators[group.id], now)
    if (decision.blocked) blockingGroupIds.push(group.id)
  }

  return {
    blocked: blockingGroupIds.length > 0,
    matchingGroupIds,
    blockingGroupIds,
  }
}
