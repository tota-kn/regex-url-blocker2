import type {
  DayOfWeek,
  DelayGrantState,
  GlobalSettings,
  Group,
  GroupPauseState,
  Restriction,
  RestrictionRule,
  ScheduleRuleCondition,
  Settings,
  TimeRange,
  TimeWindow,
  UsageCounter,
  UsageCountersState,
} from './types'
import { urlPatternMatches } from './urlPatterns'

const SKIPPED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'file://']

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
 * 1グループの現在時刻におけるブロック状態。
 */
export interface GroupBlockStatus {
  /** disabled group でない場合に設定されている制限ルール配列。 */
  restrictionRules: RestrictionRule[]
  /** `isRestrictionActiveNow` の結果。 */
  isActive: boolean
  /** `type === 'block'` で現在アクティブな time range（複数指定時のうち現在該当するもの）。 */
  activeTimeRanges: TimeRange[]
  /** `type === 'grace'` のときの今日の利用状況。 */
  timeLimitSummary?: TimeLimitUsageSummary
  /** `type === 'wait'` かつアクティブなときの待機秒数。 */
  waitSeconds?: number
  /** block 制限が現在有効なら true。 */
  blockedByTimeRange: boolean
  /** grace 制限が今日の上限に到達しているなら true。 */
  blockedByDailyLimit: boolean
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
 * group が持つ現行制限ルール配列を返す。旧 `restriction` だけを持つ値も互換的に扱う。
 */
export function getRestrictionRules(group: Group): RestrictionRule[] {
  const rules = group.restrictionRules ?? []
  if (rules.length === 0 && group.restriction) return [group.restriction]
  return rules
}

/** グループの分離形式の制限を返す。旧ペア形式も互換的に変換する。 */
export function getRestrictions(group: Group): Restriction[] {
  if (group.restrictions !== undefined) return group.restrictions
  return getRestrictionRules(group).map(({ type, graceMinutes, waitSeconds }) => ({
    type,
    graceMinutes,
    waitSeconds,
  }))
}

/** グループの分離形式の時間ウィンドウを返す。旧ペア形式も互換的に変換する。 */
export function getTimeWindows(group: Group): TimeWindow[] {
  if (group.timeWindows !== undefined) return group.timeWindows
  return getRestrictionRules(group).map((rule) =>
    rule.condition.type === 'daily' && rule.timeRanges.length === 0
      ? { type: 'always' as const }
      : { type: 'scheduled' as const, condition: rule.condition, timeRanges: rule.timeRanges },
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
 * settings 内の全グループが持つ redirect URL を返す。
 * グループ単位の `blockAction === 'redirect'` と、`type === 'redirect'` の制限が指定する URL の両方を集める。
 * redirect 先自体を再びブロックしないための除外判定に使うため、時刻ウィンドウは問わず列挙する。
 */
export function getRedirectUrls(settings: Settings): string[] {
  return settings.groups
    .filter((group) => !group.disabled)
    .flatMap((group) => {
      const urls = group.blockAction === 'redirect' ? [group.redirectUrl] : []
      return [
        ...urls,
        ...getRestrictions(group)
          .filter(
            (restriction) =>
              restriction.type === 'redirect' &&
              typeof restriction.redirectUrl === 'string' &&
              restriction.redirectUrl.trim().length > 0,
          )
          .map((restriction) => restriction.redirectUrl as string),
      ]
    })
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
 * 現在有効なブロック時間帯が次に解除される日時を返す。
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

/**
 * group の制限条件が今日（現在の論理日）に一致するなら true を返す。
 * 時刻ウィンドウは問わない。disabled group や制限未設定では false。
 */
export function restrictionMatchesToday(group: Group, now: Date, global: GlobalSettings): boolean {
  if (group.disabled) return false
  const info = getLogicalDate(now, global.dailyResetHour)
  return getTimeWindows(group).some(
    (window) => window.type === 'always' || matchesScheduleRuleCondition(window.condition, info),
  )
}

/** 時間ウィンドウが現在有効かどうかを返す。 */
function isTimeWindowActiveNow(window: TimeWindow, now: Date, global: GlobalSettings): boolean {
  if (window.type === 'always') return true
  const info = getLogicalDate(now, global.dailyResetHour)
  if (!matchesScheduleRuleCondition(window.condition, info)) return false
  if (window.timeRanges.length === 0) return true
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  return window.timeRanges.some((range) =>
    timeInRange(nowMinute, range.startMinute, range.endMinute),
  )
}

/**
 * group の制限が現在時刻でアクティブ（条件が今日に一致し、かつ時刻ウィンドウ内）かを返す。
 * disabled group や制限未設定では false。
 */
export function isRestrictionActiveNow(group: Group, now: Date, global: GlobalSettings): boolean {
  if (group.disabled) return false
  return (
    getRestrictions(group).length > 0 &&
    getTimeWindows(group).some((window) => isTimeWindowActiveNow(window, now, global))
  )
}

/**
 * group の restriction が `type === 'block'` または `type === 'redirect'` かつ現在アクティブなら、
 * 現在該当する time range 配列を返す。空配列 `timeRanges`（終日）は24時間ブロック相当の1件を返す。
 * block と redirect はどちらも有効ウィンドウ中は常にアクセスを禁止するハードブロックである。
 */
function getActiveTimeRanges(group: Group, now: Date, global: GlobalSettings): TimeRange[] {
  if (group.disabled) return []
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  if (
    !getRestrictions(group).some(
      (restriction) => restriction.type === 'block' || restriction.type === 'redirect',
    )
  )
    return []
  return getTimeWindows(group)
    .filter((window) => isTimeWindowActiveNow(window, now, global))
    .flatMap((window) => {
      if (window.type === 'always' || window.timeRanges.length === 0)
        return [{ startMinute: 0, endMinute: 0 }]
      return window.timeRanges.filter((range) =>
        timeInRange(nowMinute, range.startMinute, range.endMinute),
      )
    })
}

/**
 * group に今日有効な `grace` 制限があれば、上限・消費・残り時間を返す。
 * アクティブウィンドウ外でも、条件が今日に一致していれば累積消費を表示するため値を返す。
 * `type !== 'grace'` や disabled group、制限未設定では undefined。
 */
export function getTimeLimitUsageSummary(
  group: Group,
  counter: UsageCounter | undefined,
  now: Date,
  global: GlobalSettings,
): TimeLimitUsageSummary | undefined {
  if (group.disabled) return undefined
  const logicalDate = getLogicalDate(now, global.dailyResetHour)
  if (
    !getTimeWindows(group).some(
      (window) =>
        window.type === 'always' ||
        (window.type === 'scheduled' &&
          matchesScheduleRuleCondition(window.condition, logicalDate)),
    )
  )
    return undefined
  const limitMinutes = getRestrictions(group)
    .filter((restriction) => restriction.type === 'grace' && restriction.graceMinutes !== undefined)
    .map((restriction) => restriction.graceMinutes)
    .filter((minutes): minutes is number => minutes !== undefined)
    .toSorted((a, b) => a - b)[0]
  if (limitMinutes === undefined) return undefined

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
 * group の restriction が `type === 'redirect'` かつ現在アクティブなときの遷移先 URL を返す。
 * 有効な URL を持つ redirect 制限がなければ undefined。複数ある場合は最初の1件を使う。
 */
export function getActiveRedirectUrl(
  group: Group,
  now: Date,
  global: GlobalSettings,
): string | undefined {
  if (!isRestrictionActiveNow(group, now, global)) return undefined
  const redirect = getRestrictions(group).find(
    (restriction) =>
      restriction.type === 'redirect' &&
      typeof restriction.redirectUrl === 'string' &&
      restriction.redirectUrl.trim().length > 0,
  )
  return redirect?.redirectUrl
}

/**
 * group の restriction が `type === 'wait'` かつ現在アクティブなときの待機秒数を返す。
 * `waitSeconds` が undefined または 0 以下なら undefined（待機なし扱い）。
 */
export function getEffectiveWaitSeconds(
  group: Group,
  now: Date,
  global: GlobalSettings,
): number | undefined {
  if (!isRestrictionActiveNow(group, now, global)) return undefined
  const waitSeconds = getRestrictions(group)
    .filter((restriction) => restriction.type === 'wait')
    .filter((restriction) => restriction.waitSeconds !== undefined && restriction.waitSeconds > 0)
    .map((restriction) => restriction.waitSeconds)
    .filter((seconds): seconds is number => seconds !== undefined)
  return waitSeconds.length > 0 ? Math.max(...waitSeconds) : undefined
}

/**
 * group が指定時刻・counter でハードブロック状態か。
 * アクティブ かつ（block は常に true / grace は消費秒 >= graceMinutes*60 / wait は false）。
 */
function isGroupBlocked(
  group: Group,
  counter: UsageCounter | undefined,
  now: Date,
  global: GlobalSettings,
): boolean {
  if (getActiveTimeRanges(group, now, global).length > 0) return true
  if (
    !isRestrictionActiveNow(group, now, global) ||
    !getRestrictions(group).some((restriction) => restriction.type === 'grace')
  )
    return false

  const summary = getTimeLimitUsageSummary(group, counter, now, global)
  return summary !== undefined && summary.remainingSec <= 0
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
  const restrictionRules = group.disabled ? [] : getRestrictionRules(group)
  const isActive = isRestrictionActiveNow(group, now, global)
  const activeTimeRanges = getActiveTimeRanges(group, now, global)
  const timeLimitSummary = getTimeLimitUsageSummary(group, counter, now, global)
  const blockedByDailyLimit =
    isActive && timeLimitSummary ? timeLimitSummary.remainingSec <= 0 : false
  const waitSeconds = getEffectiveWaitSeconds(group, now, global)

  return {
    restrictionRules,
    isActive,
    activeTimeRanges,
    timeLimitSummary,
    waitSeconds,
    blockedByTimeRange: activeTimeRanges.length > 0,
    blockedByDailyLimit,
    blocked: activeTimeRanges.length > 0 || blockedByDailyLimit,
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
 * URL に該当する今日有効な閲覧上限から、残り時間が最短のものを返す。
 */
export function getMinimumRemainingTimeLimit(
  settings: Settings,
  counters: UsageCountersState,
  url: string | undefined,
  now: Date,
): MinimumRemainingTimeLimit | undefined {
  const targetGroupIds = new Set(getTargetGroupIds(settings, url))
  const summaries = settings.groups
    .filter((group) => targetGroupIds.has(group.id))
    .flatMap((group) => {
      const summary = getTimeLimitUsageSummary(
        group,
        counters.counters[group.id],
        now,
        settings.global,
      )
      return summary ? [{ group, summary }] : []
    })
    .toSorted((a, b) => a.summary.remainingSec - b.summary.remainingSec)

  return summaries[0]
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
): UrlEvaluation {
  const targetGroupIds = getTargetGroupIds(settings, url)
  const targetGroups = settings.groups.filter((group) => targetGroupIds.includes(group.id))
  const blockedGroupIds = targetGroups
    .filter((group) => isGroupBlocked(group, counters.counters[group.id], now, settings.global))
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
): UrlEvaluation {
  const evaluations = [
    evaluateUrl(baseline, counters, url, now),
    evaluateUrl(preferred, counters, url, now),
  ]
  const unique = (values: string[]): string[] => [...new Set(values)]
  const targetGroupIds = unique(evaluations.flatMap((item) => item.targetGroupIds))
  const blockedGroupIds = unique(evaluations.flatMap((item) => item.blockedGroupIds))
  const delayedGroupIds = unique(evaluations.flatMap((item) => item.delayedGroupIds))
  return {
    blocked: blockedGroupIds.length > 0,
    targetGroupIds,
    blockedGroupIds,
    delayedGroupIds,
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
  const variants = [baseline, preferred].flatMap((settings) => {
    const group = settings.groups.find((candidate) => candidate.id === groupId)
    if (!group || group.disabled || !isTargetGroup(group, url)) return []
    return [
      {
        group,
        global: settings.global,
        status: getGroupBlockStatus(group, counter, now, settings.global),
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
  const summaries = uniqueVariants
    .flatMap((item) => (item.status.timeLimitSummary ? [item.status.timeLimitSummary] : []))
    .toSorted((a, b) => a.remainingSec - b.remainingSec)
  const waitSeconds = uniqueVariants
    .flatMap((item) => (item.status.waitSeconds === undefined ? [] : [item.status.waitSeconds]))
    .toSorted((a, b) => b - a)[0]
  const uniqueObjects = <T>(values: T[]): T[] => [
    ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
  ]
  const restrictionRules = uniqueObjects(
    uniqueVariants.flatMap((item) => item.status.restrictionRules),
  )
  const activeTimeRanges = uniqueObjects(
    uniqueVariants.flatMap((item) => item.status.activeTimeRanges),
  )
  const blockedByTimeRange = uniqueVariants.some((item) => item.status.blockedByTimeRange)
  const blockedByDailyLimit = uniqueVariants.some((item) => item.status.blockedByDailyLimit)
  return {
    group: preferredGroup ?? uniqueVariants[0]!.group,
    status: {
      restrictionRules,
      isActive: uniqueVariants.some((item) => item.status.isActive),
      activeTimeRanges,
      timeLimitSummary: summaries[0],
      waitSeconds,
      blockedByTimeRange,
      blockedByDailyLimit,
      blocked: blockedByTimeRange || blockedByDailyLimit,
    },
  }
}

/**
 * 基準設定または最新設定で対象かつアクティブなグループへ、共有 counter を一度だけ加算する。
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
      if (targetIds.has(group.id) && isRestrictionActiveNow(group, now, item.global)) {
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
 * 一時停止中のグループを、URL 評価結果のブロック対象から除外する。
 */
export function applyGroupPauseState(
  evaluation: UrlEvaluation,
  groupPauseState: GroupPauseState,
  now = Date.now(),
): UrlEvaluation {
  const blockedGroupIds = evaluation.blockedGroupIds.filter((groupId) => {
    const pausedUntil = groupPauseState.groupPauseState[groupId]?.pausedUntil
    return !(typeof pausedUntil === 'number' && pausedUntil > now)
  })
  return {
    ...evaluation,
    blocked: blockedGroupIds.length > 0,
    blockedGroupIds,
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

/**
 * URL に該当し、かつ現在制限がアクティブな group counter にだけ秒数を加算する。
 * 制限なしグループや、制限はあるが現在ウィンドウ外のグループは加算されない。
 */
export function incrementCounters(
  settings: Settings,
  counters: UsageCountersState,
  url: string | undefined,
  now: Date,
  seconds: number,
): UsageCountersState {
  const normalized = normalizeCounters(settings, counters, now)
  const logicalDate = getLogicalDate(now, settings.global.dailyResetHour).logicalDate
  for (const groupId of getTargetGroupIds(settings, url)) {
    const group = settings.groups.find((g) => g.id === groupId)
    if (!group || !isRestrictionActiveNow(group, now, settings.global)) continue
    const current = normalized.counters[groupId] ?? { logicalDate, consumedSec: 0 }
    normalized.counters[groupId] = {
      logicalDate,
      consumedSec: current.consumedSec + seconds,
    }
  }
  return normalized
}
