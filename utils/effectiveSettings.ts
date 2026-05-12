import { getLogicalDate } from './blocking'
import type { DailyRule, EffectiveSettingsState, Group, Settings, TimeRange } from './types'

/**
 * 設定値を JSON 互換の deep clone として複製する。
 */
function cloneSettings(settings: Settings): Settings {
  return JSON.parse(JSON.stringify(settings)) as Settings
}

/**
 * JSON 化できる設定値同士が同一なら true を返す。
 */
function settingsEqual(a: Settings, b: Settings): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * time range の重複除去キーを返す。
 */
function rangeKey(range: TimeRange): string {
  return `${range.startMinute}-${range.endMinute}`
}

/**
 * ブロック時間帯を、削除や縮小を反映せず旧新の和集合として合成する。
 */
function mergeStrictTimeRanges(active: TimeRange[], preferred: TimeRange[]): TimeRange[] {
  if (rangesCover(preferred, active)) return preferred.map(range => ({ ...range }))

  const ranges: TimeRange[] = []
  const seen = new Set<string>()
  for (const range of [...active, ...preferred]) {
    const key = rangeKey(range)
    if (seen.has(key)) continue
    seen.add(key)
    ranges.push({ ...range })
  }
  return ranges
}

/**
 * 1分ごとのビットマップに時間帯を展開する。
 */
function blockedMinutes(ranges: TimeRange[]): boolean[] {
  const minutes = Array.from({ length: 1440 }, () => false)
  for (const range of ranges) {
    if (range.startMinute === range.endMinute) {
      minutes.fill(true)
      continue
    }
    const start = ((range.startMinute % 1440) + 1440) % 1440
    const end = ((range.endMinute % 1440) + 1440) % 1440
    if (start < end) {
      for (let minute = start; minute < end; minute += 1) minutes[minute] = true
      continue
    }
    for (let minute = start; minute < 1440; minute += 1) minutes[minute] = true
    for (let minute = 0; minute < end; minute += 1) minutes[minute] = true
  }
  return minutes
}

/**
 * candidate のブロック時間帯が required のブロック時間帯をすべて含むなら true を返す。
 */
function rangesCover(candidate: TimeRange[], required: TimeRange[]): boolean {
  const candidateMinutes = blockedMinutes(candidate)
  const requiredMinutes = blockedMinutes(required)
  return requiredMinutes.every((blocked, minute) => !blocked || candidateMinutes[minute])
}

/**
 * 1日の上限分数を、緩和を反映せずより短い値へ合成する。
 */
function mergeStrictDailyLimit(active: number | undefined, preferred: number | undefined): number | undefined {
  if (active === undefined) return preferred
  if (preferred === undefined) return active
  return Math.min(active, preferred)
}

/**
 * 同じ曜日のルールを取得する。存在しない場合は空ルールを返す。
 */
function ruleForDay(rules: DailyRule[], dayOfWeek: DailyRule['dayOfWeek']): DailyRule {
  return rules.find(rule => rule.dayOfWeek === dayOfWeek) ?? {
    dayOfWeek,
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
  }
}

/**
 * 曜日別ルールを、ブロック時間帯は和集合、上限は短い値として厳格化方向に合成する。
 */
function mergeStrictDailyRules(active: DailyRule[], preferred: DailyRule[]): DailyRule[] {
  return active.map((activeRule) => {
    const preferredRule = ruleForDay(preferred, activeRule.dayOfWeek)
    return {
      dayOfWeek: activeRule.dayOfWeek,
      blockedTimeRanges: mergeStrictTimeRanges(activeRule.blockedTimeRanges, preferredRule.blockedTimeRanges),
      dailyLimitMinutes: mergeStrictDailyLimit(activeRule.dailyLimitMinutes, preferredRule.dailyLimitMinutes),
    }
  })
}

/**
 * blacklist の pattern を、削除や編集前の値を残したまま新規文字列だけ追加する。
 */
function mergeBlacklistPatterns(active: string[], preferred: string[]): string[] {
  if (active.every(pattern => preferred.includes(pattern))) return [...preferred]
  return Array.from(new Set([...active, ...preferred]))
}

/**
 * whitelist の pattern を、追加や編集後の値を保留して旧新の共通文字列だけ残す。
 */
function mergeWhitelistPatterns(active: string[], preferred: string[]): string[] {
  if (preferred.every(pattern => active.includes(pattern))) return [...preferred]
  const preferredSet = new Set(preferred)
  return active.filter(pattern => preferredSet.has(pattern))
}

/**
 * 既存グループ同士を、判定対象が緩まない範囲で合成する。
 */
function mergeStrictGroup(active: Group, preferred: Group): Group {
  if (active.mode !== preferred.mode) return active

  return {
    ...active,
    name: preferred.name,
    patterns: active.mode === 'blacklist'
      ? mergeBlacklistPatterns(active.patterns, preferred.patterns)
      : mergeWhitelistPatterns(active.patterns, preferred.patterns),
    dailyRules: mergeStrictDailyRules(active.dailyRules, preferred.dailyRules),
  }
}

/**
 * 希望設定から、同じ論理日中に即時反映してよい厳格化だけを有効設定へ合成する。
 */
export function mergeImmediateRestrictions(active: Settings, preferred: Settings): Settings {
  const preferredById = new Map(preferred.groups.map(group => [group.id, group]))
  const activeIds = new Set(active.groups.map(group => group.id))
  const mergedGroups = active.groups.map((group) => {
    const preferredGroup = preferredById.get(group.id)
    return preferredGroup ? mergeStrictGroup(group, preferredGroup) : group
  })

  for (const preferredGroup of preferred.groups) {
    if (!activeIds.has(preferredGroup.id)) {
      mergedGroups.push(JSON.parse(JSON.stringify(preferredGroup)) as Group)
    }
  }

  return {
    global: {
      blockAction: preferred.global.blockAction,
      redirectUrl: preferred.global.redirectUrl,
      dailyResetHour: active.global.dailyResetHour === preferred.global.dailyResetHour
        ? preferred.global.dailyResetHour
        : active.global.dailyResetHour,
      notificationThresholdMinutes: preferred.global.notificationThresholdMinutes,
    },
    groups: mergedGroups,
  }
}

/**
 * 希望設定と有効設定に差分があるなら true を返す。
 */
export function hasPendingEffectiveSettings(preferred: Settings, effective: Settings): boolean {
  return !settingsEqual(preferred, effective)
}

/**
 * 現在時刻と設定のリセット時刻から、有効設定 state の初期値を作る。
 */
export function createEffectiveSettingsState(settings: Settings, now: Date): EffectiveSettingsState {
  return {
    effectiveSettings: cloneSettings(settings),
    effectiveSettingsLogicalDate: getLogicalDate(now, settings.global.dailyResetHour).logicalDate,
  }
}

/**
 * 論理日切替時は希望設定を丸ごと昇格し、それ以外は厳格化だけを有効設定へ反映する。
 */
export function reconcileEffectiveSettings(preferred: Settings, current: EffectiveSettingsState | undefined, now: Date): EffectiveSettingsState {
  if (!current) return createEffectiveSettingsState(preferred, now)

  const activeLogicalDate = getLogicalDate(now, current.effectiveSettings.global.dailyResetHour).logicalDate
  if (activeLogicalDate !== current.effectiveSettingsLogicalDate) {
    return createEffectiveSettingsState(preferred, now)
  }

  return {
    effectiveSettings: mergeImmediateRestrictions(current.effectiveSettings, preferred),
    effectiveSettingsLogicalDate: current.effectiveSettingsLogicalDate,
  }
}

/**
 * 次に有効設定が丸ごと昇格するリセット日時を返す。
 */
export function getNextEffectiveSettingsResetAt(effectiveSettings: Settings, now: Date): Date {
  const [hour = '0', minute = '0'] = effectiveSettings.global.dailyResetHour.split(':')
  const resetAt = new Date(now)
  resetAt.setHours(Number(hour), Number(minute), 0, 0)
  if (resetAt.getTime() <= now.getTime()) {
    resetAt.setDate(resetAt.getDate() + 1)
  }
  return resetAt
}
