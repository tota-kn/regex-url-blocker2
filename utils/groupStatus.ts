import { jsonEqual, uniqueByJson } from './json'
import { getLogicalDate, getNextDailyResetAt } from './logicalDate'
import { bothSettings, strictestBy, type SettingsPair } from './settingsPair'
import {
  getActiveBlockTimeRanges,
  getActiveRules,
  getActiveTimeRanges,
  getBlockedTimeRangeReleaseAt,
  getRuleActiveTimeRanges,
  isAllDayWindow,
  isWindowActiveAt,
} from './timeWindow'
import type {
  BlockDestination,
  BlockingRule,
  GlobalSettings,
  Group,
  Rule,
  RuleKind,
  Settings,
  TimeRange,
  UsageCounter,
  UsageCountersState,
} from './types'
import { isTargetGroup } from './urlTargeting'
import {
  buildUsageSummary,
  getTimeLimitUsageSummary,
  resolveDailyLimitRule,
  type TimeLimitUsageSummary,
} from './usageCounters'

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
 * アクセスがブロックされた理由と、それを起こしたルール。
 * 遷移先はこのルールの `destination` から決まる。
 */
export type BlockReason =
  | { kind: 'block'; rule: BlockingRule }
  | { kind: 'dailyLimit'; rule: BlockingRule; summary: TimeLimitUsageSummary }

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

/** ルール配列から dailyLimit の最小上限分数を返す。1件も無ければ undefined。 */
function minDailyLimitMinutes(rules: Rule[]): number | undefined {
  return resolveDailyLimitRule(rules)?.minutes
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

  const blockRule = active.find((rule): rule is BlockingRule => rule.restriction.kind === 'block')
  if (blockRule) return { kind: 'block', rule: blockRule }

  const limitMinutes = minDailyLimitMinutes(active)
  if (limitMinutes === undefined) return undefined
  const dailyRule = active.find(
    (rule): rule is BlockingRule =>
      rule.restriction.kind === 'dailyLimit' && rule.restriction.minutes === limitMinutes,
  )
  if (!dailyRule) return undefined
  const summary = buildUsageSummary(
    limitMinutes,
    counter,
    getLogicalDate(now, global.dailyResetHour).logicalDate,
  )
  return summary.remainingSec <= 0 ? { kind: 'dailyLimit', rule: dailyRule, summary } : undefined
}

/** ブロック理由から遷移先を返す。 */
export function getBlockDestination(reason: BlockReason): BlockDestination {
  return reason.rule.destination
}

/**
 * 複数のブロック理由から、評価順（`RULE_KIND_ORDER`）で最も強いものを返す。
 * 基準設定と最新設定の両方で成立した理由を1つに畳むために使う。
 */
export function strictestBlockReason(reasons: BlockReason[]): BlockReason | undefined {
  return strictestBy(reasons, (reason) => RULE_KIND_PRIORITY[reason.rule.restriction.kind], 'min')
}

/** 二重評価結果のblocked groupから、評価順で最も強いブロック理由を返す。 */
export function strictestEffectiveBlockReason(
  pair: SettingsPair,
  blockedGroupIds: string[],
  counters: UsageCountersState,
  now: Date,
): BlockReason | undefined {
  const ids = new Set(blockedGroupIds)
  const reasons = bothSettings(pair).flatMap((settings) =>
    settings.groups
      .filter((group) => ids.has(group.id))
      .flatMap((group) => {
        const reason = getBlockReason(group, counters.counters[group.id], now, settings.global)
        return reason ? [reason] : []
      }),
  )
  return strictestBlockReason(reasons)
}

/** 基準設定と希望設定から、対象groupに課される最も厳しいwait設定を返す。 */
export function getEffectiveWaitForPair(
  pair: SettingsPair,
  groupId: string,
  url: string,
  now: Date,
): EffectiveWait | undefined {
  const waits = bothSettings(pair).flatMap((settings) => {
    const group = settings.groups.find((candidate) => candidate.id === groupId)
    if (!group || !isTargetGroup(group, url)) return []
    const wait = getEffectiveWait(group, now, settings.global)
    return wait ? [wait] : []
  })
  if (waits.length === 0) return undefined
  return {
    seconds: Math.max(...waits.map((wait) => wait.seconds)),
    grantMinutes: Math.max(...waits.map((wait) => wait.grantMinutes)),
  }
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
    activeTimeRanges: getActiveBlockTimeRanges(activeRules, now),
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
  if (isAllDayWindow(rule.window)) return resetAt

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
