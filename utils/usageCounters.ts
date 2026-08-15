import { getLogicalDate, windowMatchesLogicalDate } from './logicalDate'
import type {
  GlobalSettings,
  Group,
  Rule,
  Settings,
  UsageCounter,
  UsageCountersState,
} from './types'

/** 1グループの今日の閲覧上限と消費状況。 */
export interface TimeLimitUsageSummary {
  /** 論理日の識別子。 */
  logicalDate: string
  /** 今日有効な上限分数。 */
  limitMinutes: number
  /** 今日の累積閲覧秒数。 */
  consumedSec: number
  /** 今日の残り閲覧秒数。 */
  remainingSec: number
}

/** URLに該当する上限のうち、残り時間が最短のグループ。 */
export interface MinimumRemainingTimeLimit {
  /** 残り時間が最短だったグループ。 */
  group: Group
  /** 今日の上限利用状況。 */
  summary: TimeLimitUsageSummary
}

/** 上限分数とcounterから利用状況を組み立てる。 */
export function buildUsageSummary(
  limitMinutes: number,
  counter: UsageCounter | undefined,
  logicalDate: string,
): TimeLimitUsageSummary {
  const consumedSec = counter?.logicalDate === logicalDate ? counter.consumedSec : 0
  return {
    logicalDate,
    limitMinutes,
    consumedSec,
    remainingSec: Math.max(0, limitMinutes * 60 - consumedSec),
  }
}

/** ルール配列から最小のdaily limitと由来ルールを返す。 */
export function resolveDailyLimitRule(rules: Rule[]): { minutes: number; rule: Rule } | undefined {
  return rules
    .flatMap((rule) =>
      rule.restriction.kind === 'dailyLimit' ? [{ minutes: rule.restriction.minutes, rule }] : [],
    )
    .toSorted((a, b) => a.minutes - b.minutes)[0]
}

/** groupに今日有効なdaily limitがあれば利用状況を返す。 */
export function getTimeLimitUsageSummary(
  group: Group,
  counter: UsageCounter | undefined,
  now: Date,
  global: GlobalSettings,
): TimeLimitUsageSummary | undefined {
  if (group.disabled) return undefined
  const info = getLogicalDate(now, global.dailyResetHour)
  const todaysRules = group.rules.filter((rule) => windowMatchesLogicalDate(rule.window, info))
  const limit = resolveDailyLimitRule(todaysRules)
  return limit ? buildUsageSummary(limit.minutes, counter, info.logicalDate) : undefined
}

/**
 * 2つの counter 状態が同じ group について同じ論理日・同じ消費秒数を持つなら true。
 * キーの列挙順は比較しない。
 */
export function countersEqual(a: UsageCountersState, b: UsageCountersState): boolean {
  const aIds = Object.keys(a.counters)
  const bIds = Object.keys(b.counters)
  if (aIds.length !== bIds.length) return false
  return aIds.every((groupId) => {
    const left = a.counters[groupId]
    const right = b.counters[groupId]
    return (
      right !== undefined &&
      left!.logicalDate === right.logicalDate &&
      left!.consumedSec === right.consumedSec
    )
  })
}

/** settings に合わせて counter を現在論理日に正規化し、削除済み group の値を除去する。 */
export function normalizeCounters(
  settings: Settings,
  counters: UsageCountersState,
  now: Date,
): UsageCountersState {
  const logicalDate = getLogicalDate(now, settings.global.dailyResetHour).logicalDate
  const normalized: UsageCountersState = { counters: {} }
  for (const group of settings.groups) {
    if (group.disabled) continue
    const current = counters.counters[group.id]
    normalized.counters[group.id] = {
      logicalDate,
      consumedSec:
        current?.logicalDate === logicalDate ? Math.max(0, Math.floor(current.consumedSec)) : 0,
    }
  }
  return normalized
}
