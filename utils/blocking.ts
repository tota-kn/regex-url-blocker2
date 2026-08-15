import type {
  BlockDestination,
  DayOfWeek,
  DelayGrantState,
  GlobalSettings,
  Group,
  GroupPauseState,
  Rule,
  RuleKind,
  ScheduleRuleCondition,
  Settings,
  TimeRange,
  TimeWindow,
  UsageCounter,
  UsageCountersState,
} from './types'
import { dateAtMinuteOfDay, formatDate, minuteOfDate, minuteOfDay } from './datetime'
import { jsonEqual, uniqueByJson } from './json'
import { bothSettings, strictestBy, type SettingsPair } from './settingsPair'
import { urlPatternMatches } from './urlPatterns'

const SKIPPED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'file://']

/**
 * 制限が評価される順序。先に並ぶものほど強く、成立した時点でそれ以降は評価されない。
 * 保存時とロード時にこの順へ並べ替えるため、画面のルール順と評価順は常に一致する。
 */
export const RULE_KIND_PRIORITY: Record<RuleKind, number> = {
  block: 0,
  dailyLimit: 1,
  wait: 2,
}

/** 制限種別を評価順に並べた配列。 */
export const RULE_KIND_ORDER: RuleKind[] = ['block', 'dailyLimit', 'wait']

/**
 * 論理日と、その論理日開始時点の暦情報。
 */
export interface LogicalDateInfo {
  /** 論理日を一意に表すローカル日付文字列。 */
  logicalDate: string
  /** 論理日開始時点のローカル曜日。 */
  dayOfWeek: DayOfWeek
  /** 論理日開始時点のローカル月（1-12）。 */
  month: number
  /** 論理日開始時点のローカル日（1-31）。 */
  dayOfMonth: number
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
  /** ハードブロックされていないが待機ゲートを課す group id。 */
  delayedGroupIds: string[]
}

/**
 * 1グループの今日の閲覧上限と消費状況。
 */
export interface TimeLimitUsageSummary {
  /** `dailyResetHour` を起点に算出した論理日の識別子。 */
  logicalDate: string
  /** 今日有効な上限分数。 */
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
 * アクセスがブロックされた理由と、それを起こしたルール。
 * 遷移先はこのルールの `destination` から決まる。
 */
export type BlockReason =
  | { kind: 'block'; rule: Rule }
  | { kind: 'dailyLimit'; rule: Rule; summary: TimeLimitUsageSummary }

/**
 * 1グループの現在時刻におけるブロック状態。
 */
export interface GroupBlockStatus {
  /** disabled group でない場合に設定されているルールの配列。 */
  rules: Rule[]
  /** 現在アクティブなルールが1件以上あるなら true。 */
  isActive: boolean
  /** 現在アクティブな block ルールの time range（終日は 0-0 の1件）。 */
  activeTimeRanges: TimeRange[]
  /** dailyLimit ルールが今日設定されているときの利用状況。 */
  timeLimitSummary?: TimeLimitUsageSummary
  /** wait ルールがアクティブなときの待機秒数。 */
  waitSeconds?: number
  /** wait ルールがアクティブなときの通過後許可期間（分）。 */
  waitGrantMinutes?: number
  /** block ルールが現在有効なら true。 */
  blockedByTimeRange: boolean
  /** dailyLimit ルールが今日の上限に到達しているなら true。 */
  blockedByDailyLimit: boolean
  /** ブロックされている場合の理由と原因ルール。 */
  blockReason?: BlockReason
  /** 一時停止を考慮しない現在のブロック状態。 */
  blocked: boolean
}

/** 二重評価されたグループの表示情報。 */
export interface EffectiveGroupBlockStatus {
  /** 最新の表示用メタデータを持つグループ。 */
  group: Group
  /** 基準設定と最新設定から合成した状態。 */
  status: GroupBlockStatus
}

/**
 * ルールを評価順（Block → Daily limit → Wait）へ安定ソートする。
 * 同種のルールは元の並び順を保つ。冪等。
 */
export function sortRulesByEvaluationOrder(rules: Rule[]): Rule[] {
  return rules.toSorted(
    (a, b) => RULE_KIND_PRIORITY[a.restriction.kind] - RULE_KIND_PRIORITY[b.restriction.kind],
  )
}

/**
 * グローバル設定のリセット時刻を起点にした論理日情報を返す。
 */
export function getLogicalDate(now: Date, dailyResetHour: string): LogicalDateInfo {
  const start = dateAtMinuteOfDay(now, minuteOfDay(dailyResetHour))
  if (now.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1)
  }
  return {
    logicalDate: formatDate(start),
    dayOfWeek: start.getDay() as DayOfWeek,
    month: start.getMonth() + 1,
    dayOfMonth: start.getDate(),
  }
}

/**
 * URL が判定対象外なら true を返す。
 */
export function shouldSkipUrl(url: string | undefined, redirectUrls: string | string[]): boolean {
  if (!url) return true
  const urls = Array.isArray(redirectUrls) ? redirectUrls : [redirectUrls]
  if (urls.includes(url)) return true
  return SKIPPED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
}

/**
 * settings 内の全グループのルールが指定する遷移先 URL を返す。
 * redirect 先自体を再びブロックしないための除外判定に使うため、時刻ウィンドウは問わず列挙する。
 */
export function getRedirectUrls(settings: Settings): string[] {
  return settings.groups
    .filter((group) => !group.disabled)
    .flatMap((group) =>
      group.rules.flatMap((rule) =>
        rule.destination?.type === 'redirect' && rule.destination.url.trim().length > 0
          ? [rule.destination.url]
          : [],
      ),
    )
}

/**
 * group の有効な URL pattern のうち、URL に一致するものがあるかを返す。
 */
function patternMatches(group: Group, url: string): boolean {
  return group.patterns.some((pattern) => urlPatternMatches(pattern, url))
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
  if (shouldSkipUrl(url, getRedirectUrls(settings)) || !url) return []
  return settings.groups
    .filter((group) => !group.disabled)
    .filter((group) => isTargetGroup(group, url))
    .map((group) => group.id)
}

/**
 * 時刻 T が時間帯に含まれるなら true を返す。
 * `startMinute === endMinute` は終日、`startMinute > endMinute` は日跨ぎとして扱う。
 */
export function timeInRange(nowMinute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return true
  if (startMinute < endMinute) return nowMinute >= startMinute && nowMinute < endMinute
  return nowMinute >= startMinute || nowMinute < endMinute
}

/**
 * 現在有効な時間帯が次に解除される日時を返す。
 */
export function getBlockedTimeRangeReleaseAt(range: TimeRange, now: Date): Date {
  const nowMinute = minuteOfDate(now)

  if (range.startMinute === range.endMinute) {
    const releaseAt = dateAtMinuteOfDay(now, range.endMinute)
    if (releaseAt.getTime() <= now.getTime()) releaseAt.setDate(releaseAt.getDate() + 1)
    return releaseAt
  }

  const releaseAt = dateAtMinuteOfDay(now, range.endMinute)
  if (range.startMinute > range.endMinute && nowMinute >= range.startMinute) {
    releaseAt.setDate(releaseAt.getDate() + 1)
  }
  return releaseAt
}

/**
 * 次の daily reset 到来日時を返す。
 */
export function getNextDailyResetAt(now: Date, global: GlobalSettings): Date {
  const resetMinute = minuteOfDay(global.dailyResetHour)
  const resetAt = dateAtMinuteOfDay(now, resetMinute)
  if (resetAt.getTime() <= now.getTime()) resetAt.setDate(resetAt.getDate() + 1)
  return resetAt
}

/**
 * 月日を比較可能な数値キーへ変換する。
 */
function monthDayKey(month: number, day: number): number {
  return month * 100 + day
}

/**
 * スケジュールルールの条件が指定した論理日に一致するなら true を返す。
 */
export function matchesScheduleRuleCondition(
  condition: ScheduleRuleCondition,
  info: LogicalDateInfo,
): boolean {
  if (condition.type === 'weekly') return condition.daysOfWeek.includes(info.dayOfWeek)
  if (condition.type === 'monthly') return condition.daysOfMonth.includes(info.dayOfMonth)
  if (condition.type === 'period') {
    const start = monthDayKey(condition.start.month, condition.start.day)
    const end = monthDayKey(condition.end.month, condition.end.day)
    const key = monthDayKey(info.month, info.dayOfMonth)
    return start <= end ? key >= start && key <= end : key >= start || key <= end
  }
  return true
}

/** 時間ウィンドウの適用日条件が指定した論理日に一致するなら true を返す。時刻は問わない。 */
function windowMatchesLogicalDate(window: TimeWindow, info: LogicalDateInfo): boolean {
  return window.type === 'always' || matchesScheduleRuleCondition(window.condition, info)
}

/** 時間ウィンドウが指定時刻に有効かを返す。 */
export function isWindowActiveAt(window: TimeWindow, at: Date, global: GlobalSettings): boolean {
  if (window.type === 'always') return true
  const info = getLogicalDate(at, global.dailyResetHour)
  if (!matchesScheduleRuleCondition(window.condition, info)) return false
  if (window.timeRanges.length === 0) return true
  const atMinute = minuteOfDate(at)
  return window.timeRanges.some((range) =>
    timeInRange(atMinute, range.startMinute, range.endMinute),
  )
}

/** ルール配列のうち、指定時刻に有効なものだけを返す。 */
export function filterActiveRules(rules: Rule[], at: Date, global: GlobalSettings): Rule[] {
  return rules.filter((rule) => isWindowActiveAt(rule.window, at, global))
}

/** group のルールのうち、指定時刻に有効なものだけを返す。disabled group では空配列。 */
export function getActiveRules(group: Group, now: Date, global: GlobalSettings): Rule[] {
  if (group.disabled) return []
  return filterActiveRules(group.rules, now, global)
}

/**
 * group のルールが現在時刻で1件以上アクティブかを返す。
 * disabled group やルール未設定では false。
 */
export function isRestrictionActiveNow(group: Group, now: Date, global: GlobalSettings): boolean {
  return getActiveRules(group, now, global).length > 0
}

/**
 * ルール1件のウィンドウのうち、指定時刻に該当する time range 配列を返す。
 * 空 `timeRanges`（終日）や `always` は24時間相当の1件を返す。
 * 適用日条件は判定しないため、呼び出し側で `isWindowActiveAt` と併用すること。
 */
function getRuleActiveTimeRanges(rule: Rule, at: Date): TimeRange[] {
  if (rule.window.type === 'always' || rule.window.timeRanges.length === 0) {
    return [{ startMinute: 0, endMinute: 0 }]
  }
  const atMinute = minuteOfDate(at)
  return rule.window.timeRanges.filter((range) =>
    timeInRange(atMinute, range.startMinute, range.endMinute),
  )
}

/**
 * アクティブなルール配列のうち block ルールが該当する time range 配列を返す。
 * 空 `timeRanges`（終日）や `always` は24時間ブロック相当の1件を返す。
 */
function activeBlockTimeRanges(activeRules: Rule[], at: Date): TimeRange[] {
  return activeRules
    .filter((rule) => rule.restriction.kind === 'block')
    .flatMap((rule) => getRuleActiveTimeRanges(rule, at))
}

/**
 * 現在アクティブな block ルールが該当する time range 配列を返す。
 * 空 `timeRanges`（終日）や `always` は24時間ブロック相当の1件を返す。
 */
function getActiveTimeRanges(group: Group, now: Date, global: GlobalSettings): TimeRange[] {
  return activeBlockTimeRanges(getActiveRules(group, now, global), now)
}

/** 上限分数と counter から利用状況を組み立てる。 */
function buildUsageSummary(
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

/**
 * ルール配列から、実際に採用される dailyLimit ルールを返す（最小分数）。
 * dailyLimit ルールが1件も無ければ undefined。
 *
 * 「どのルールが効いているか」を画面表示でも使うため、分数と併せて由来ルールを返す。
 */
export function resolveDailyLimitRule(rules: Rule[]): { minutes: number; rule: Rule } | undefined {
  return rules
    .flatMap((rule) =>
      rule.restriction.kind === 'dailyLimit' ? [{ minutes: rule.restriction.minutes, rule }] : [],
    )
    .toSorted((a, b) => a.minutes - b.minutes)[0]
}

/** ルール配列から dailyLimit の最小上限分数を返す。1件も無ければ undefined。 */
function minDailyLimitMinutes(rules: Rule[]): number | undefined {
  return resolveDailyLimitRule(rules)?.minutes
}

/**
 * group に今日有効な dailyLimit ルールがあれば、上限・消費・残り時間を返す。
 * アクティブウィンドウ外でも、適用日条件が今日に一致していれば累積消費を表示するため値を返す。
 */
export function getTimeLimitUsageSummary(
  group: Group,
  counter: UsageCounter | undefined,
  now: Date,
  global: GlobalSettings,
): TimeLimitUsageSummary | undefined {
  if (group.disabled) return undefined
  const info = getLogicalDate(now, global.dailyResetHour)
  const todaysRules = group.rules.filter((rule) => windowMatchesLogicalDate(rule.window, info))
  const limitMinutes = minDailyLimitMinutes(todaysRules)
  if (limitMinutes === undefined) return undefined
  return buildUsageSummary(limitMinutes, counter, info.logicalDate)
}

/**
 * group に現在課される待機ゲートの設定。
 */
export interface EffectiveWait {
  /** 待機ゲートで待たせる秒数。アクティブな wait ルールのうち最長。 */
  seconds: number
  /** 通過後にアクセスを許可する分数。アクティブな wait ルールのうち最長。 */
  grantMinutes: number
}

/**
 * ルール配列から、実際に課される待機ゲートを返す。
 *
 * 秒数・許可分数とも最長のものを採る（同一ルール由来とは限らない）。
 * `seconds <= 0` と `grantMinutes < 1` のルールは「待機を課さない」として無視する。
 * 待機を課すルールが1件も無ければ undefined。
 *
 * 画面表示（`describeCurrentState`）と実際の待機ゲートが食い違わないよう、
 * 両者はこの関数だけを縮約の単一の入口として使うこと。
 */
export function resolveEffectiveWait(rules: Rule[]): EffectiveWait | undefined {
  const waits = rules.flatMap((rule) =>
    rule.restriction.kind === 'wait' &&
    rule.restriction.seconds > 0 &&
    Number.isInteger(rule.restriction.grantMinutes) &&
    rule.restriction.grantMinutes >= 1
      ? [{ seconds: rule.restriction.seconds, grantMinutes: rule.restriction.grantMinutes }]
      : [],
  )
  if (waits.length === 0) return undefined
  return {
    seconds: Math.max(...waits.map((wait) => wait.seconds)),
    grantMinutes: Math.max(...waits.map((wait) => wait.grantMinutes)),
  }
}

/**
 * group のアクティブな wait ルールから、実際に課される待機ゲートを返す。
 * 縮約の規則は {@link resolveEffectiveWait} を参照。
 */
export function getEffectiveWait(
  group: Group,
  now: Date,
  global: GlobalSettings,
): EffectiveWait | undefined {
  return resolveEffectiveWait(getActiveRules(group, now, global))
}

/**
 * group がブロックされている理由と、それを起こしたルールを返す。
 * 評価順（block → dailyLimit）で最初に成立したものを返し、wait は含まない。
 */
export function getBlockReason(
  group: Group,
  counter: UsageCounter | undefined,
  now: Date,
  global: GlobalSettings,
): BlockReason | undefined {
  const active = getActiveRules(group, now, global)

  const blockRule = active.find((rule) => rule.restriction.kind === 'block')
  if (blockRule) return { kind: 'block', rule: blockRule }

  const limitMinutes = minDailyLimitMinutes(active)
  if (limitMinutes === undefined) return undefined
  const dailyRule = active.find(
    (rule) => rule.restriction.kind === 'dailyLimit' && rule.restriction.minutes === limitMinutes,
  )
  if (!dailyRule) return undefined
  const summary = buildUsageSummary(
    limitMinutes,
    counter,
    getLogicalDate(now, global.dailyResetHour).logicalDate,
  )
  return summary.remainingSec <= 0 ? { kind: 'dailyLimit', rule: dailyRule, summary } : undefined
}

/** ブロック理由から遷移先を返す。ルールが遷移先を持たない場合はブロックページ。 */
export function getBlockDestination(reason: BlockReason): BlockDestination {
  return reason.rule.destination ?? { type: 'blockedPage' }
}

/**
 * 複数のブロック理由から、評価順（`RULE_KIND_ORDER`）で最も強いものを返す。
 * 基準設定と最新設定の両方で成立した理由を1つに畳むために使う。
 */
export function strictestBlockReason(reasons: BlockReason[]): BlockReason | undefined {
  return strictestBy(reasons, (reason) => RULE_KIND_PRIORITY[reason.rule.restriction.kind], 'min')
}

/**
 * group の popup 表示向けブロック状態を返す。
 */
export function getGroupBlockStatus(
  group: Group,
  counter: UsageCounter | undefined,
  now: Date,
  global: GlobalSettings,
): GroupBlockStatus {
  const rules = group.disabled ? [] : group.rules
  const blockReason = getBlockReason(group, counter, now, global)
  // 同じアクティブルール集合を4つの派生値で使うため、1回だけ求める。
  const activeRules = getActiveRules(group, now, global)
  const wait = resolveEffectiveWait(activeRules)

  return {
    rules,
    isActive: activeRules.length > 0,
    activeTimeRanges: activeBlockTimeRanges(activeRules, now),
    timeLimitSummary: getTimeLimitUsageSummary(group, counter, now, global),
    waitSeconds: wait?.seconds,
    waitGrantMinutes: wait?.grantMinutes,
    blockedByTimeRange: blockReason?.kind === 'block',
    blockedByDailyLimit: blockReason?.kind === 'dailyLimit',
    ...(blockReason ? { blockReason } : {}),
    blocked: blockReason !== undefined,
  }
}

/**
 * 現在有効な時間帯ブロックが実際に解除される日時を返す。
 * 翌論理日は条件が一致しなくなりうるため、論理日境界ごとにアクティブ状態を再評価しながら先へ進める。
 * 最大366ステップ探索しても解除されない場合は undefined（実質常時ブロック）を返す。
 */
export function getTimeRangeUnblockAt(
  group: Group,
  now: Date,
  global: GlobalSettings,
): Date | undefined {
  const MAX_STEPS = 366
  let t = new Date(now)
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const activeRanges = getActiveTimeRanges(group, t, global)
    if (activeRanges.length === 0) return t

    const nextBoundaries = [
      ...activeRanges.map((range) => getBlockedTimeRangeReleaseAt(range, t).getTime()),
      getNextDailyResetAt(t, global).getTime(),
    ]
    t = new Date(Math.min(...nextBoundaries))
  }
  return undefined
}

/**
 * dailyLimit による現在のブロックが解除される日時を返す。
 * 上限は日次リセットで戻るが、ルールのウィンドウを抜けた時点でもブロックは解除されるため、
 * ウィンドウ終了と次の日次リセットのうち早い方を返す。
 */
export function getDailyLimitReleaseAt(rule: Rule, now: Date, global: GlobalSettings): Date {
  const resetAt = getNextDailyResetAt(now, global)
  if (rule.window.type === 'always' || rule.window.timeRanges.length === 0) return resetAt

  // 時間帯の境界ごとに再評価し、ウィンドウを抜ける最初の時刻を探す。
  // 境界は必ず未来へ進み、日次リセットで打ち切るため必ず停止する。
  let t = new Date(now)
  while (t.getTime() < resetAt.getTime()) {
    if (!isWindowActiveAt(rule.window, t, global)) return t
    const boundaries = getRuleActiveTimeRanges(rule, t).map((range) =>
      getBlockedTimeRangeReleaseAt(range, t).getTime(),
    )
    if (boundaries.length === 0) return t
    t = new Date(Math.min(...boundaries))
  }
  return resetAt
}

/**
 * 二重評価で集めた、1グループ分の候補値。
 */
export interface TargetCandidate<T> {
  /** 候補の出どころとなったグループ。 */
  group: Group
  /** そのグループが属していた設定のグローバル設定。 */
  global: GlobalSettings
  /** `pick` が返した値。 */
  value: T
}

/**
 * 基準設定と希望設定を独立に評価し、URL の制限対象グループごとの候補値を集める。
 *
 * 同じ group id が両設定に存在すれば候補は2件になる。どちらを採るかは呼び出し側が
 * `strictestBy` などで決める。`pick` が undefined を返した候補は除外する。
 */
export function collectTargetCandidates<T>(
  pair: SettingsPair,
  url: string | undefined,
  pick: (group: Group, global: GlobalSettings) => T | undefined,
): TargetCandidate<T>[] {
  return bothSettings(pair).flatMap((settings) => {
    const targetIds = new Set(getTargetGroupIds(settings, url))
    return settings.groups.flatMap((group) => {
      if (!targetIds.has(group.id)) return []
      const value = pick(group, settings.global)
      return value === undefined ? [] : [{ group, global: settings.global, value }]
    })
  })
}

/**
 * 基準設定と最新設定を独立に調べ、残り時間が最短の閲覧上限を返す。
 */
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

/**
 * 残り秒数を切り上げの分単位 badge 文字列に変換する。
 */
export function formatRemainingMinutesBadge(remainingSec: number): string {
  return `${Math.ceil(Math.max(0, remainingSec) / 60)}m`
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
 * URL に独立して該当した基準・最新グループだけから、表示用の厳しい状態を合成する。
 */
export function getEffectiveGroupBlockStatus(
  groupId: string,
  baseline: Settings,
  preferred: Settings,
  counter: UsageCounter | undefined,
  url: string | undefined,
  now: Date,
): EffectiveGroupBlockStatus | undefined {
  if (!url) return undefined
  const variants = bothSettings({ baseline, preferred }).flatMap((settings) => {
    const group = settings.groups.find((candidate) => candidate.id === groupId)
    if (!group || group.disabled || !isTargetGroup(group, url)) return []
    return [{ group, status: getGroupBlockStatus(group, counter, now, settings.global) }]
  })
  const uniqueVariants = variants.filter(
    (variant, index, all) =>
      all.findIndex((candidate) => jsonEqual(candidate.group, variant.group)) === index,
  )
  if (uniqueVariants.length === 0) return undefined

  const preferredGroup = preferred.groups.find((group) => group.id === groupId)
  const maxOf = (values: (number | undefined)[]): number | undefined =>
    strictestBy(
      values.filter((value): value is number => value !== undefined),
      (value) => value,
      'max',
    )

  const strictestSummary = strictestBy(
    uniqueVariants.flatMap((item) =>
      item.status.timeLimitSummary ? [item.status.timeLimitSummary] : [],
    ),
    (summary) => summary.remainingSec,
    'min',
  )
  const blockedByTimeRange = uniqueVariants.some((item) => item.status.blockedByTimeRange)
  const blockedByDailyLimit = uniqueVariants.some((item) => item.status.blockedByDailyLimit)
  const blockReason = strictestBlockReason(
    uniqueVariants.flatMap((item) => (item.status.blockReason ? [item.status.blockReason] : [])),
  )

  return {
    group: preferredGroup ?? uniqueVariants[0]!.group,
    status: {
      rules: uniqueByJson(uniqueVariants.flatMap((item) => item.status.rules)),
      isActive: uniqueVariants.some((item) => item.status.isActive),
      activeTimeRanges: uniqueByJson(
        uniqueVariants.flatMap((item) => item.status.activeTimeRanges),
      ),
      timeLimitSummary: strictestSummary,
      waitSeconds: maxOf(uniqueVariants.map((item) => item.status.waitSeconds)),
      waitGrantMinutes: maxOf(uniqueVariants.map((item) => item.status.waitGrantMinutes)),
      blockedByTimeRange,
      blockedByDailyLimit,
      ...(blockReason ? { blockReason } : {}),
      blocked: blockedByTimeRange || blockedByDailyLimit,
    },
  }
}

/**
 * 基準設定または最新設定で対象かつ dailyLimit がアクティブなグループへ、共有 counter を一度だけ加算する。
 */
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

  // どちらかの設定で dailyLimit がアクティブなら加算対象。共有 counter なので一度だけ足す。
  const activeIds = new Set(
    collectTargetCandidates(pair, url, (group, global) =>
      hasActiveDailyLimit(group, now, global) ? group.id : undefined,
    ).map((candidate) => candidate.value),
  )
  for (const groupId of activeIds) {
    const current = normalized.counters[groupId] ?? { logicalDate, consumedSec: 0 }
    normalized.counters[groupId] = { logicalDate, consumedSec: current.consumedSec + seconds }
  }
  return normalized
}

/**
 * dailyLimit ルールが現在アクティブなら true を返す。
 * 閲覧秒数は上限を持つルールが有効な時間帯だけ加算する。
 */
function hasActiveDailyLimit(group: Group, now: Date, global: GlobalSettings): boolean {
  return getActiveRules(group, now, global).some((rule) => rule.restriction.kind === 'dailyLimit')
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

/**
 * 2つの counter 状態が同じ group について同じ論理日・同じ消費秒数を持つなら true を返す。
 *
 * `normalizeCounters` は `settings.groups` の順にキーを作り直すため、
 * 保存済みの値とはキーの並び順が違いうる。JSON 比較では内容が同じでも差分と誤判定するので、
 * キー集合と値で比べる。
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

/**
 * settings に合わせて counter を現在論理日に正規化し、削除済み group の値を除去する。
 */
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
