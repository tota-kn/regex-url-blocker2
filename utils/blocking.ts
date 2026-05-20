import type { DayOfWeek, GlobalSettings, Group, Settings, UsageCounter, UsageCountersState } from './types'
import { urlPatternMatches } from './urlPatterns'

const SKIPPED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'file://']

/**
 * 論理日と、その論理日開始時点の曜日。
 */
export interface LogicalDateInfo {
  /** 論理日を一意に表すローカル日付文字列。 */
  logicalDate: string
  /** 論理日開始時点のローカル曜日。 */
  dayOfWeek: DayOfWeek
}

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
}

/**
 * 1グループの今日の閲覧上限と消費状況。
 */
export interface TimeLimitUsageSummary {
  /** `dailyResetHour` を起点に算出した論理日の識別子。 */
  logicalDate: string
  /** 今日有効な最小上限分数。 */
  limitMinutes: number
  /** 今日の累積閲覧秒数。 */
  consumedSec: number
  /** 今日の残り閲覧秒数。0 未満にはしない。 */
  remainingSec: number
}

/**
 * URL に該当する閲覧上限のうち、最も残り時間が短いグループの利用状況。
 */
export interface MinimumRemainingTimeLimit {
  /** 残り時間が最短だったグループ。 */
  group: Group
  /** 今日の上限利用状況。 */
  summary: TimeLimitUsageSummary
}

/**
 * "HH:MM" を日内分に変換する。不正値は 0 として扱う。
 */
function minuteOfDay(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return 0
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return 0
  return hour * 60 + minute
}

/**
 * 日時からローカル日付の ID を作る。
 */
function dateId(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * グローバル設定のリセット時刻を起点にした論理日情報を返す。
 */
export function getLogicalDate(now: Date, dailyResetHour: string): LogicalDateInfo {
  const resetMinute = minuteOfDay(dailyResetHour)
  const start = new Date(now)
  start.setHours(Math.floor(resetMinute / 60), resetMinute % 60, 0, 0)
  if (now.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1)
  }
  return {
    logicalDate: dateId(start),
    dayOfWeek: start.getDay() as DayOfWeek,
  }
}

/**
 * URL が判定対象外なら true を返す。
 */
export function shouldSkipUrl(url: string | undefined, redirectUrl: string): boolean {
  if (!url) return true
  if (url === redirectUrl) return true
  return SKIPPED_URL_PREFIXES.some(prefix => url.startsWith(prefix))
}

/**
 * group の有効な URL pattern のうち、URL に一致するものがあるかを返す。
 */
function patternMatches(group: Group, url: string): boolean {
  return group.patterns.some(pattern => urlPatternMatches(pattern, url))
}

/**
 * URL が group の制限対象に該当するなら true を返す。
 */
export function isTargetGroup(group: Group, url: string): boolean {
  const matched = patternMatches(group, url)
  return group.mode === 'whitelist' ? !matched : matched
}

/**
 * URL が制限対象として該当する group id を返す。
 */
export function getTargetGroupIds(settings: Settings, url: string | undefined): string[] {
  if (shouldSkipUrl(url, settings.global.redirectUrl) || !url) return []
  return settings.groups
    .filter(group => isTargetGroup(group, url))
    .map(group => group.id)
}

/**
 * 時刻 T が時間帯に含まれるなら true を返す。
 */
function timeInRange(nowMinute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return true
  if (startMinute < endMinute) return nowMinute >= startMinute && nowMinute < endMinute
  return nowMinute >= startMinute || nowMinute < endMinute
}

/**
 * group が指定時刻・counter でブロック状態なら true を返す。
 */
function isGroupBlocked(group: Group, counter: UsageCounter | undefined, now: Date, global: GlobalSettings): boolean {
  const logicalDate = getLogicalDate(now, global.dailyResetHour)
  const dailyRule = group.dailyRules.find(rule => rule.dayOfWeek === logicalDate.dayOfWeek)
  if (!dailyRule) return false
  if (dailyRule.blockedTimeRanges.length === 0 && dailyRule.dailyLimitMinutes === undefined) return false

  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const blockedBySlot = dailyRule.blockedTimeRanges.some(range =>
    timeInRange(nowMinute, range.startMinute, range.endMinute),
  )
  if (blockedBySlot) return true

  if (dailyRule.dailyLimitMinutes === undefined) return false

  const consumedSec = counter?.logicalDate === logicalDate.logicalDate ? counter.consumedSec : 0
  return consumedSec >= dailyRule.dailyLimitMinutes * 60
}

/**
 * group に今日有効な閲覧上限があれば、上限・消費・残り時間を返す。
 */
export function getTimeLimitUsageSummary(group: Group, counter: UsageCounter | undefined, now: Date, global: GlobalSettings): TimeLimitUsageSummary | undefined {
  const logicalDate = getLogicalDate(now, global.dailyResetHour)
  const dailyRule = group.dailyRules.find(rule => rule.dayOfWeek === logicalDate.dayOfWeek)
  if (!dailyRule || dailyRule.dailyLimitMinutes === undefined) return undefined

  const limitMinutes = dailyRule.dailyLimitMinutes
  const consumedSec = counter?.logicalDate === logicalDate.logicalDate ? counter.consumedSec : 0
  const limitSec = limitMinutes * 60
  return {
    logicalDate: logicalDate.logicalDate,
    limitMinutes,
    consumedSec,
    remainingSec: Math.max(0, limitSec - consumedSec),
  }
}

/**
 * URL に該当する今日有効な閲覧上限から、残り時間が最短のものを返す。
 */
export function getMinimumRemainingTimeLimit(settings: Settings, counters: UsageCountersState, url: string | undefined, now: Date): MinimumRemainingTimeLimit | undefined {
  const targetGroupIds = new Set(getTargetGroupIds(settings, url))
  const summaries = settings.groups
    .filter(group => targetGroupIds.has(group.id))
    .flatMap((group) => {
      const summary = getTimeLimitUsageSummary(group, counters.counters[group.id], now, settings.global)
      return summary ? [{ group, summary }] : []
    })
    .sort((a, b) => a.summary.remainingSec - b.summary.remainingSec)

  return summaries[0]
}

/**
 * 残り秒数を切り上げの分単位 badge 文字列に変換する。
 */
export function formatRemainingMinutesBadge(remainingSec: number): string {
  return `${Math.ceil(Math.max(0, remainingSec) / 60)}m`
}

/**
 * URL が現在ブロックされるかを評価する。
 */
export function evaluateUrl(settings: Settings, counters: UsageCountersState, url: string | undefined, now: Date): UrlEvaluation {
  const targetGroupIds = getTargetGroupIds(settings, url)
  const targetGroups = settings.groups.filter(group => targetGroupIds.includes(group.id))
  const blockedGroupIds = targetGroups
    .filter(group => isGroupBlocked(group, counters.counters[group.id], now, settings.global))
    .map(group => group.id)

  return {
    blocked: blockedGroupIds.length > 0,
    targetGroupIds,
    blockedGroupIds,
  }
}

/**
 * settings に合わせて counter を現在論理日に正規化し、削除済み group の値を除去する。
 */
export function normalizeCounters(settings: Settings, counters: UsageCountersState, now: Date): UsageCountersState {
  const logicalDate = getLogicalDate(now, settings.global.dailyResetHour).logicalDate
  const normalized: UsageCountersState = { counters: {} }
  for (const group of settings.groups) {
    const current = counters.counters[group.id]
    normalized.counters[group.id] = {
      logicalDate,
      consumedSec: current?.logicalDate === logicalDate ? Math.max(0, Math.floor(current.consumedSec)) : 0,
    }
  }
  return normalized
}

/**
 * URL に該当するすべての group counter に秒数を加算する。
 */
export function incrementCounters(settings: Settings, counters: UsageCountersState, url: string | undefined, now: Date, seconds: number): UsageCountersState {
  const normalized = normalizeCounters(settings, counters, now)
  const logicalDate = getLogicalDate(now, settings.global.dailyResetHour).logicalDate
  for (const groupId of getTargetGroupIds(settings, url)) {
    const current = normalized.counters[groupId] ?? { logicalDate, consumedSec: 0 }
    normalized.counters[groupId] = {
      logicalDate,
      consumedSec: current.consumedSec + seconds,
    }
  }
  return normalized
}
