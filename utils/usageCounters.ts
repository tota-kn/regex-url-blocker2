import { getLogicalDate, windowMatchesLogicalDate } from './logicalDate'
import { bothSettings, strictestBy, type SettingsPair } from './settingsPair'
import { collectTargetCandidates } from './targetCandidates'
import { getActiveRules } from './timeWindow'
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

/** 基準設定と希望設定を調べ、残り時間が最短の閲覧上限を返す。 */
export function getMinimumEffectiveRemainingTimeLimit(
  baseline: Settings,
  preferred: Settings,
  counters: UsageCountersState,
  url: string | undefined,
  now: Date,
): MinimumRemainingTimeLimit | undefined {
  const candidates = collectTargetCandidates({ baseline, preferred }, url, (group, global) =>
    getTimeLimitUsageSummary(group, counters.counters[group.id], now, global),
  )
  const strictest = strictestBy(candidates, (item) => item.value.remainingSec, 'min')
  return strictest ? { group: strictest.group, summary: strictest.value } : undefined
}

/** 残り秒数を切り上げの分単位badge文字列に変換する。 */
export function formatRemainingMinutesBadge(remainingSec: number): string {
  return `${Math.ceil(Math.max(0, remainingSec) / 60)}m`
}

/** 基準設定または希望設定で対象かつdaily limitが有効なgroupへcounterを一度加算する。 */
export function incrementEffectiveCounters(
  baseline: Settings,
  preferred: Settings,
  counters: UsageCountersState,
  url: string | undefined,
  now: Date,
  seconds: number,
): UsageCountersState {
  const pair: SettingsPair = { baseline, preferred }
  const allGroups = bothSettings(pair).flatMap((item) => item.groups)
  const normalizationSettings: Settings = {
    global: baseline.global,
    groups: [...new Map(allGroups.map((group) => [group.id, group])).values()],
  }
  const normalized = normalizeCounters(normalizationSettings, counters, now)
  const logicalDate = getLogicalDate(now, baseline.global.dailyResetHour).logicalDate
  const activeIds = new Set(
    collectTargetCandidates(pair, url, (group, global) =>
      getActiveRules(group, now, global).some((rule) => rule.restriction.kind === 'dailyLimit')
        ? group.id
        : undefined,
    ).map((candidate) => candidate.value),
  )
  for (const groupId of activeIds) {
    const current = normalized.counters[groupId] ?? { logicalDate, consumedSec: 0 }
    normalized.counters[groupId] = { logicalDate, consumedSec: current.consumedSec + seconds }
  }
  return normalized
}
