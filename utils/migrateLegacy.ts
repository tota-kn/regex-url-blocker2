import { DEFAULT_WAIT_GRANT_MINUTES } from './defaults'
import { sortRulesByEvaluationOrder } from './groupStatus'
import { normalizeTimeRange, toTimeWindow } from './normalizeSchema'
import { asRecord } from './record'
import type {
  BlockDestination,
  DayOfWeek,
  Rule,
  RuleRestriction,
  TimeRange,
  TimeWindow,
} from './types'

/**
 * 旧フォーマット（`Group.restrictions`）の制限種別。
 * `Rule` へ移行済みのため、この形式は読み取り時の変換にのみ使う。
 */
export type LegacyRestrictionType = 'block' | 'redirect' | 'grace' | 'wait'

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
    // 旧 grace の 0 分（未設定含む）は即ブロックを意味するため Block へ畳む。
    const minutes = restriction.graceMinutes ?? 0
    return minutes > 0 ? { kind: 'dailyLimit', minutes } : { kind: 'block' }
  }
  if (restriction.type === 'wait') {
    return {
      kind: 'wait',
      seconds: restriction.waitSeconds ?? 0,
      grantMinutes: restriction.waitGrantMinutes ?? DEFAULT_WAIT_GRANT_MINUTES,
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

/** unknown の値から旧フォーマットの制限を生成する。移行にのみ使う。 */
function normalizeLegacyRestriction(value: unknown): LegacyRestriction | undefined {
  const valueRecord = asRecord(value)
  if (
    valueRecord.type !== 'block' &&
    valueRecord.type !== 'redirect' &&
    valueRecord.type !== 'grace' &&
    valueRecord.type !== 'wait'
  )
    return undefined
  const restriction: LegacyRestriction = { type: valueRecord.type }
  if (typeof valueRecord.graceMinutes === 'number')
    restriction.graceMinutes = valueRecord.graceMinutes
  if (typeof valueRecord.waitSeconds === 'number') restriction.waitSeconds = valueRecord.waitSeconds
  if (valueRecord.type === 'wait') {
    restriction.waitGrantMinutes =
      typeof valueRecord.waitGrantMinutes === 'number' && valueRecord.waitGrantMinutes >= 1
        ? valueRecord.waitGrantMinutes
        : DEFAULT_WAIT_GRANT_MINUTES
  }
  if (typeof valueRecord.redirectUrl === 'string') restriction.redirectUrl = valueRecord.redirectUrl
  return restriction
}

/**
 * unknown の値から旧フォーマットの制限配列を生成する。
 * 同種は厳格側（grace は最小・wait は最大）へ畳む。
 * 配列でなければ undefined を返し、呼び出し側が `dailyRules` へフォールバックできるようにする。
 */
export function normalizeLegacyRestrictions(value: unknown): LegacyRestriction[] | undefined {
  if (!Array.isArray(value)) return undefined
  const restrictions = value.flatMap((item) => {
    const restriction = normalizeLegacyRestriction(item)
    return restriction ? [restriction] : []
  })
  const block = restrictions.find((restriction) => restriction.type === 'block')
  const redirect = restrictions.find((restriction) => restriction.type === 'redirect')
  const graceMinutes = restrictions
    .filter((restriction) => restriction.type === 'grace')
    .map((restriction) => restriction.graceMinutes)
    .filter((minutes): minutes is number => minutes !== undefined)
  const waitSeconds = restrictions
    .filter((restriction) => restriction.type === 'wait')
    .map((restriction) => restriction.waitSeconds)
    .filter((seconds): seconds is number => seconds !== undefined)
  const waitGrantMinutes = restrictions
    .filter((restriction) => restriction.type === 'wait')
    .map((restriction) => restriction.waitGrantMinutes ?? DEFAULT_WAIT_GRANT_MINUTES)
    .filter(
      (minutes): minutes is number =>
        minutes !== undefined && Number.isInteger(minutes) && minutes >= 1,
    )
  const normalized: LegacyRestriction[] = []
  if (block) normalized.push({ type: 'block' })
  else if (redirect) normalized.push(redirect)
  if (graceMinutes.length > 0)
    normalized.push({ type: 'grace', graceMinutes: Math.min(...graceMinutes) })
  if (waitSeconds.length > 0)
    normalized.push({
      type: 'wait',
      waitSeconds: Math.max(...waitSeconds),
      waitGrantMinutes:
        waitGrantMinutes.length > 0 ? Math.max(...waitGrantMinutes) : DEFAULT_WAIT_GRANT_MINUTES,
    })
  return normalized
}

/**
 * 旧フォーマット（v2〜v4）の曜日別ルール（`dailyRules`）を `timeWindows` / `restrictions` へ変換する。
 * 同一内容（ブロック時間帯・上限）の曜日をまとめて weekly 条件1件にし、全曜日同一なら daily 条件にする。
 * ブロック時間帯は block 制限、閲覧上限は grace 制限として block → grace の順に展開する。
 */
export function convertLegacyDailyRules(value: unknown): {
  timeWindows: TimeWindow[]
  restrictions: LegacyRestriction[]
} {
  const timeWindows: TimeWindow[] = []
  const restrictions: LegacyRestriction[] = []
  if (!Array.isArray(value)) return { timeWindows, restrictions }

  const byContent = new Map<
    string,
    { daysOfWeek: Set<DayOfWeek>; blockedTimeRanges: TimeRange[]; dailyLimitMinutes?: number }
  >()
  for (const item of value) {
    const rule = asRecord(item)
    const dayOfWeek = rule.dayOfWeek
    if (!Number.isInteger(dayOfWeek) || (dayOfWeek as number) < 0 || (dayOfWeek as number) > 6)
      continue

    const blockedTimeRanges = Array.isArray(rule.blockedTimeRanges)
      ? rule.blockedTimeRanges.map(normalizeTimeRange)
      : []
    const dailyLimitMinutes =
      typeof rule.dailyLimitMinutes === 'number' ? rule.dailyLimitMinutes : undefined
    if (blockedTimeRanges.length === 0 && dailyLimitMinutes === undefined) continue

    const key = JSON.stringify([blockedTimeRanges, dailyLimitMinutes ?? null])
    const entry = byContent.get(key) ?? {
      daysOfWeek: new Set<DayOfWeek>(),
      blockedTimeRanges,
      dailyLimitMinutes,
    }
    entry.daysOfWeek.add(dayOfWeek as DayOfWeek)
    byContent.set(key, entry)
  }

  const entries = [...byContent.values()].map((entry) => ({
    condition:
      entry.daysOfWeek.size === 7
        ? { type: 'daily' as const }
        : { type: 'weekly' as const, daysOfWeek: [...entry.daysOfWeek].toSorted((a, b) => a - b) },
    blockedTimeRanges: entry.blockedTimeRanges,
    dailyLimitMinutes: entry.dailyLimitMinutes,
  }))
  for (const entry of entries) {
    if (entry.blockedTimeRanges.length === 0) continue
    timeWindows.push(toTimeWindow(entry.condition, entry.blockedTimeRanges))
    restrictions.push({ type: 'block' })
  }
  for (const entry of entries) {
    if (entry.dailyLimitMinutes === undefined) continue
    timeWindows.push(toTimeWindow(entry.condition, []))
    restrictions.push({ type: 'grace', graceMinutes: entry.dailyLimitMinutes })
  }
  return { timeWindows, restrictions }
}
