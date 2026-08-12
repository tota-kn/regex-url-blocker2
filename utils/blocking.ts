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
  SessionLimitEntry,
  SessionLimitState,
  Settings,
  TimeRange,
  TimeWindow,
  UsageCounter,
  UsageCountersState,
} from './types'
import { urlPatternMatches } from './urlPatterns'

const SKIPPED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'file://']

/**
 * 制限が評価される順序。先に並ぶものほど強く、成立した時点でそれ以降は評価されない。
 * 保存時とロード時にこの順へ並べ替えるため、画面のルール順と評価順は常に一致する。
 */
export const RULE_KIND_ORDER: RuleKind[] = ['block', 'sessionLimit', 'dailyLimit', 'wait']

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
  | { kind: 'sessionLimit'; rule: Rule; breakUntil: number }
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
  /** sessionLimit の休憩中なら、その終了 epoch milliseconds。 */
  sessionBreakUntil?: number
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

/** Session limit の有効な設定値。 */
export interface SessionLimitConfig {
  /** 最短の利用枠（分）。 */
  sessionMinutes: number
  /** 最長の休憩（分）。 */
  breakMinutes: number
  /** この設定を決めたルール。遷移先の決定に使う。 */
  rule: Rule
}

/** グループの制限ルールを返す。 */
export function getRules(group: Group): Rule[] {
  return group.rules ?? []
}

/**
 * ルールを評価順（Block → Session limit → Daily limit → Wait）へ安定ソートする。
 * 同種のルールは元の並び順を保つ。冪等。
 */
export function sortRulesByEvaluationOrder(rules: Rule[]): Rule[] {
  return rules.toSorted(
    (a, b) =>
      RULE_KIND_ORDER.indexOf(a.restriction.kind) - RULE_KIND_ORDER.indexOf(b.restriction.kind),
  )
}

/**
 * 指定日の日内分に対応するローカル日時を返す。
 */
function dateAtMinuteOfDay(date: Date, minute: number): Date {
  const result = new Date(date)
  result.setHours(Math.floor(minute / 60), minute % 60, 0, 0)
  return result
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
      getRules(group).flatMap((rule) =>
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
 */
function timeInRange(nowMinute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return true
  if (startMinute < endMinute) return nowMinute >= startMinute && nowMinute < endMinute
  return nowMinute >= startMinute || nowMinute < endMinute
}

/**
 * 現在有効な時間帯が次に解除される日時を返す。
 */
export function getBlockedTimeRangeReleaseAt(range: TimeRange, now: Date): Date {
  const nowMinute = now.getHours() * 60 + now.getMinutes()

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
export function windowMatchesLogicalDate(window: TimeWindow, info: LogicalDateInfo): boolean {
  return window.type === 'always' || matchesScheduleRuleCondition(window.condition, info)
}

/** 時間ウィンドウが指定時刻に有効かを返す。 */
export function isWindowActiveAt(window: TimeWindow, at: Date, global: GlobalSettings): boolean {
  if (window.type === 'always') return true
  const info = getLogicalDate(at, global.dailyResetHour)
  if (!matchesScheduleRuleCondition(window.condition, info)) return false
  if (window.timeRanges.length === 0) return true
  const atMinute = at.getHours() * 60 + at.getMinutes()
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
  return filterActiveRules(getRules(group), now, global)
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
  const atMinute = at.getHours() * 60 + at.getMinutes()
  return rule.window.timeRanges.filter((range) =>
    timeInRange(atMinute, range.startMinute, range.endMinute),
  )
}

/**
 * 現在アクティブな block ルールが該当する time range 配列を返す。
 * 空 `timeRanges`（終日）や `always` は24時間ブロック相当の1件を返す。
 */
function getActiveTimeRanges(group: Group, now: Date, global: GlobalSettings): TimeRange[] {
  return getActiveRules(group, now, global)
    .filter((rule) => rule.restriction.kind === 'block')
    .flatMap((rule) => getRuleActiveTimeRanges(rule, now))
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

/** ルール配列から dailyLimit の最小上限分数を返す。1件も無ければ undefined。 */
function minDailyLimitMinutes(rules: Rule[]): number | undefined {
  const minutes = rules.flatMap((rule) =>
    rule.restriction.kind === 'dailyLimit' ? [rule.restriction.minutes] : [],
  )
  return minutes.length > 0 ? Math.min(...minutes) : undefined
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
  const todaysRules = getRules(group).filter((rule) => windowMatchesLogicalDate(rule.window, info))
  const limitMinutes = minDailyLimitMinutes(todaysRules)
  if (limitMinutes === undefined) return undefined
  return buildUsageSummary(limitMinutes, counter, info.logicalDate)
}

/** group のアクティブな wait ルールにおける最長の待機秒数を返す。0以下は待機なし扱い。 */
export function getEffectiveWaitSeconds(
  group: Group,
  now: Date,
  global: GlobalSettings,
): number | undefined {
  const seconds = getActiveRules(group, now, global).flatMap((rule) =>
    rule.restriction.kind === 'wait' && rule.restriction.seconds > 0
      ? [rule.restriction.seconds]
      : [],
  )
  return seconds.length > 0 ? Math.max(...seconds) : undefined
}

/** group のアクティブな wait ルールにおける、通過後の最長許可期間（分）を返す。 */
export function getEffectiveWaitGrantMinutes(
  group: Group,
  now: Date,
  global: GlobalSettings,
): number | undefined {
  if (getEffectiveWaitSeconds(group, now, global) === undefined) return undefined
  const minutes = getActiveRules(group, now, global).flatMap((rule) =>
    rule.restriction.kind === 'wait' && Number.isInteger(rule.restriction.grantMinutes)
      ? [rule.restriction.grantMinutes]
      : [],
  )
  return minutes.length > 0 ? Math.max(...minutes) : undefined
}

/** group のアクティブな sessionLimit ルールを厳格側（最短枠・最長休憩）へまとめて返す。 */
export function getSessionLimitConfig(
  group: Group,
  now: Date,
  global: GlobalSettings,
): SessionLimitConfig | undefined {
  const limits = getActiveRules(group, now, global).flatMap((rule) =>
    rule.restriction.kind === 'sessionLimit' &&
    Number.isInteger(rule.restriction.sessionMinutes) &&
    rule.restriction.sessionMinutes >= 1 &&
    Number.isInteger(rule.restriction.breakMinutes) &&
    rule.restriction.breakMinutes >= 1
      ? [{ rule, restriction: rule.restriction }]
      : [],
  )
  if (limits.length === 0) return undefined
  const strictest = limits.toSorted(
    (a, b) => a.restriction.sessionMinutes - b.restriction.sessionMinutes,
  )[0]!
  return {
    sessionMinutes: strictest.restriction.sessionMinutes,
    breakMinutes: Math.max(...limits.map((item) => item.restriction.breakMinutes)),
    rule: strictest.rule,
  }
}

/** 利用枠の状態から、現在休憩中ならその終了時刻を返す。 */
export function getSessionBreakUntil(
  group: Group,
  entry: SessionLimitEntry | undefined,
  now: Date,
  global: GlobalSettings,
): number | undefined {
  if (!entry) return undefined
  const config = getSessionLimitConfig(group, now, global)
  if (!config) return undefined
  const sessionEndsAt = entry.startedAt + config.sessionMinutes * 60_000
  const breakEndsAt = sessionEndsAt + config.breakMinutes * 60_000
  const nowMs = now.getTime()
  return nowMs >= sessionEndsAt && nowMs < breakEndsAt ? breakEndsAt : undefined
}

/**
 * group がブロックされている理由と、それを起こしたルールを返す。
 * 評価順（block → sessionLimit → dailyLimit）で最初に成立したものを返し、wait は含まない。
 */
export function getBlockReason(
  group: Group,
  counter: UsageCounter | undefined,
  sessionEntry: SessionLimitEntry | undefined,
  now: Date,
  global: GlobalSettings,
): BlockReason | undefined {
  const active = getActiveRules(group, now, global)

  const blockRule = active.find((rule) => rule.restriction.kind === 'block')
  if (blockRule) return { kind: 'block', rule: blockRule }

  const sessionConfig = getSessionLimitConfig(group, now, global)
  const breakUntil = getSessionBreakUntil(group, sessionEntry, now, global)
  if (sessionConfig && breakUntil !== undefined) {
    return { kind: 'sessionLimit', rule: sessionConfig.rule, breakUntil }
  }

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
 * group の popup 表示向けブロック状態を返す。
 */
export function getGroupBlockStatus(
  group: Group,
  counter: UsageCounter | undefined,
  now: Date,
  global: GlobalSettings,
  sessionEntry: SessionLimitEntry | undefined = undefined,
): GroupBlockStatus {
  const rules = group.disabled ? [] : getRules(group)
  const blockReason = getBlockReason(group, counter, sessionEntry, now, global)

  return {
    rules,
    isActive: isRestrictionActiveNow(group, now, global),
    activeTimeRanges: getActiveTimeRanges(group, now, global),
    timeLimitSummary: getTimeLimitUsageSummary(group, counter, now, global),
    waitSeconds: getEffectiveWaitSeconds(group, now, global),
    waitGrantMinutes: getEffectiveWaitGrantMinutes(group, now, global),
    blockedByTimeRange: blockReason?.kind === 'block',
    blockedByDailyLimit: blockReason?.kind === 'dailyLimit',
    ...(blockReason?.kind === 'sessionLimit' ? { sessionBreakUntil: blockReason.breakUntil } : {}),
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
 * 基準設定と最新設定を独立に調べ、残り時間が最短の閲覧上限を返す。
 */
export function getMinimumEffectiveRemainingTimeLimit(
  baseline: Settings,
  preferred: Settings,
  counters: UsageCountersState,
  url: string | undefined,
  now: Date,
): MinimumRemainingTimeLimit | undefined {
  return [baseline, preferred]
    .flatMap((item) => {
      const targetIds = new Set(getTargetGroupIds(item, url))
      return item.groups
        .filter((group) => targetIds.has(group.id))
        .flatMap((group) => {
          const summary = getTimeLimitUsageSummary(
            group,
            counters.counters[group.id],
            now,
            item.global,
          )
          return summary ? [{ group, summary }] : []
        })
    })
    .toSorted((a, b) => a.summary.remainingSec - b.summary.remainingSec)[0]
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
  sessionLimitState: SessionLimitState = { sessionLimitState: {} },
): UrlEvaluation {
  const targetGroupIds = getTargetGroupIds(settings, url)
  const targetGroups = settings.groups.filter((group) => targetGroupIds.includes(group.id))
  const blockedGroupIds = targetGroups
    .filter(
      (group) =>
        getBlockReason(
          group,
          counters.counters[group.id],
          sessionLimitState.sessionLimitState[group.id],
          now,
          settings.global,
        ) !== undefined,
    )
    .map((group) => group.id)

  const delayedGroupIds = targetGroups
    .filter((group) => getEffectiveWaitSeconds(group, now, settings.global) !== undefined)
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
  sessionLimitState: SessionLimitState = { sessionLimitState: {} },
): UrlEvaluation {
  const evaluations = [
    evaluateUrl(baseline, counters, url, now, sessionLimitState),
    evaluateUrl(preferred, counters, url, now, sessionLimitState),
  ]
  const unique = (values: string[]): string[] => [...new Set(values)]
  const blockedGroupIds = unique(evaluations.flatMap((item) => item.blockedGroupIds))
  return {
    blocked: blockedGroupIds.length > 0,
    targetGroupIds: unique(evaluations.flatMap((item) => item.targetGroupIds)),
    blockedGroupIds,
    delayedGroupIds: unique(evaluations.flatMap((item) => item.delayedGroupIds)),
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
  sessionLimitState: SessionLimitState = { sessionLimitState: {} },
): EffectiveGroupBlockStatus | undefined {
  if (!url) return undefined
  const variants = [baseline, preferred].flatMap((settings) => {
    const group = settings.groups.find((candidate) => candidate.id === groupId)
    if (!group || group.disabled || !isTargetGroup(group, url)) return []
    return [
      {
        group,
        status: getGroupBlockStatus(
          group,
          counter,
          now,
          settings.global,
          sessionLimitState.sessionLimitState[group.id],
        ),
      },
    ]
  })
  const uniqueVariants = variants.filter(
    (variant, index, all) =>
      all.findIndex(
        (candidate) => JSON.stringify(candidate.group) === JSON.stringify(variant.group),
      ) === index,
  )
  if (uniqueVariants.length === 0) return undefined

  const preferredGroup = preferred.groups.find((group) => group.id === groupId)
  const uniqueObjects = <T>(values: T[]): T[] => [
    ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
  ]
  const maxOf = (values: (number | undefined)[]): number | undefined =>
    values.filter((value): value is number => value !== undefined).toSorted((a, b) => b - a)[0]

  const summaries = uniqueVariants
    .flatMap((item) => (item.status.timeLimitSummary ? [item.status.timeLimitSummary] : []))
    .toSorted((a, b) => a.remainingSec - b.remainingSec)
  const blockedByTimeRange = uniqueVariants.some((item) => item.status.blockedByTimeRange)
  const blockedByDailyLimit = uniqueVariants.some((item) => item.status.blockedByDailyLimit)
  const sessionBreakUntil = maxOf(uniqueVariants.map((item) => item.status.sessionBreakUntil))
  // 評価順で最も強い理由を採用する。
  const blockReason = uniqueVariants
    .flatMap((item) => (item.status.blockReason ? [item.status.blockReason] : []))
    .toSorted(
      (a, b) =>
        RULE_KIND_ORDER.indexOf(a.rule.restriction.kind) -
        RULE_KIND_ORDER.indexOf(b.rule.restriction.kind),
    )[0]

  return {
    group: preferredGroup ?? uniqueVariants[0]!.group,
    status: {
      rules: uniqueObjects(uniqueVariants.flatMap((item) => item.status.rules)),
      isActive: uniqueVariants.some((item) => item.status.isActive),
      activeTimeRanges: uniqueObjects(
        uniqueVariants.flatMap((item) => item.status.activeTimeRanges),
      ),
      timeLimitSummary: summaries[0],
      waitSeconds: maxOf(uniqueVariants.map((item) => item.status.waitSeconds)),
      waitGrantMinutes: maxOf(uniqueVariants.map((item) => item.status.waitGrantMinutes)),
      blockedByTimeRange,
      blockedByDailyLimit,
      ...(sessionBreakUntil === undefined ? {} : { sessionBreakUntil }),
      ...(blockReason ? { blockReason } : {}),
      blocked: blockedByTimeRange || blockedByDailyLimit || sessionBreakUntil !== undefined,
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
  const settings = [baseline, preferred]
  const allGroups = settings.flatMap((item) => item.groups)
  const normalizationSettings: Settings = {
    global: baseline.global,
    groups: [...new Map(allGroups.map((group) => [group.id, group])).values()],
  }
  const normalized = normalizeCounters(normalizationSettings, counters, now)
  const logicalDate = getLogicalDate(now, baseline.global.dailyResetHour).logicalDate
  const activeIds = new Set<string>()

  for (const item of settings) {
    const targetIds = new Set(getTargetGroupIds(item, url))
    for (const group of item.groups) {
      if (targetIds.has(group.id) && hasActiveDailyLimit(group, now, item.global)) {
        activeIds.add(group.id)
      }
    }
  }
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
export function hasActiveDailyLimit(group: Group, now: Date, global: GlobalSettings): boolean {
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
