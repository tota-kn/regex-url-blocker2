import { getLogicalDate, getNextDailyResetAt } from './blocking'
import { DEFAULT_PAUSE_DURATION_MINUTES, DEFAULT_PAUSE_WAIT_SECONDS } from './defaults'
import { cloneGroup, cloneSettings } from './groups'
import { jsonEqual } from './json'
import type { EffectiveSettingsState, Group, Settings } from './types'

/**
 * Lock Mode 中に、基準グループと希望グループから実効値を決める方針。
 * - `identity`: グループの同一性を担う値。解決の対象にしない。
 * - `immediate`: 制限の強さに関わらないため希望値を即時採用する。
 * - `baseline`: 基準値を次の rule day まで凍結する。強化方向の反映は `blocking.ts` が
 *   基準設定と希望設定を二重評価して厳しい結果を採ることで実現する。
 * - `strictest`: 評価時に二重評価できないため、読み取り時に厳しい方を採用する。
 */
type FieldApplier = (target: Group, baseline: Group, preferred: Group) => void

/**
 * 一時停止設定の数値を読み取る。未指定や入力途中の非数値は既定値へ丸める。
 */
function pauseNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

type FieldPolicy =
  | { kind: 'identity' }
  | { kind: 'baseline' }
  | { kind: 'immediate'; apply: FieldApplier }
  | { kind: 'strictest'; apply: FieldApplier }

/**
 * `Group` の全フィールドの解決方針。
 * フィールドを追加するとこのオブジェクトが型エラーになり、方針の指定が強制される。
 */
const GROUP_FIELD_POLICIES: Record<keyof Group, FieldPolicy> = {
  id: { kind: 'identity' },
  name: {
    kind: 'immediate',
    apply: (target, _baseline, preferred) => {
      target.name = preferred.name
    },
  },
  mode: { kind: 'baseline' },
  disabled: { kind: 'baseline' },
  lockMode: { kind: 'baseline' },
  patterns: { kind: 'baseline' },
  rules: { kind: 'baseline' },
  pauseAllowed: {
    kind: 'strictest',
    // どちらかが禁止していれば禁止。禁止は即時、再許可は次の rule day まで遅延する。
    apply: (target, baseline, preferred) => {
      target.pauseAllowed = baseline.pauseAllowed !== false && preferred.pauseAllowed !== false
    },
  },
  pauseWaitSeconds: {
    kind: 'strictest',
    // 待機が長いほど厳しい。
    apply: (target, baseline, preferred) => {
      target.pauseWaitSeconds = Math.max(
        pauseNumber(baseline.pauseWaitSeconds, DEFAULT_PAUSE_WAIT_SECONDS),
        pauseNumber(preferred.pauseWaitSeconds, DEFAULT_PAUSE_WAIT_SECONDS),
      )
    },
  },
  pauseDurationMinutes: {
    kind: 'strictest',
    // 一時停止が短いほど厳しい。
    apply: (target, baseline, preferred) => {
      target.pauseDurationMinutes = Math.min(
        pauseNumber(baseline.pauseDurationMinutes, DEFAULT_PAUSE_DURATION_MINUTES),
        pauseNumber(preferred.pauseDurationMinutes, DEFAULT_PAUSE_DURATION_MINUTES),
      )
    },
  },
}

/** `Group` の全フィールドキーを返す。 */
export function groupFieldKeys(): Array<keyof Group> {
  return Object.keys(GROUP_FIELD_POLICIES) as Array<keyof Group>
}

/**
 * 全フィールドの解決結果を target へ書き込む。
 * `immediate` のみを適用するか `strictest` も適用するかを `includeStrictest` で切り替える。
 */
function applyFieldPolicies(
  target: Group,
  baseline: Group,
  preferred: Group,
  includeStrictest: boolean,
): void {
  for (const key of groupFieldKeys()) {
    const policy = GROUP_FIELD_POLICIES[key]
    if (policy.kind === 'immediate' || (policy.kind === 'strictest' && includeStrictest)) {
      policy.apply(target, baseline, preferred)
    }
  }
}

/**
 * 省略可能な一時停止設定を既定値で埋めたグループを返す。
 */
function withPauseDefaults(group: Group): Group {
  return {
    ...group,
    pauseWaitSeconds: pauseNumber(group.pauseWaitSeconds, DEFAULT_PAUSE_WAIT_SECONDS),
    pauseDurationMinutes: pauseNumber(group.pauseDurationMinutes, DEFAULT_PAUSE_DURATION_MINUTES),
  }
}

/**
 * Lock Mode ON のグループを次の rule day まで凍結した基準スナップショットを作る。
 * `immediate` なフィールドだけを希望値で上書きし、`strictest` は保存側では解決しない。
 * ここで解決すると強化した値が基準へ蓄積し、同じ rule day 内で元の値へ戻せなくなるため。
 */
function freezeBaselineGroup(baseline: Group, preferred: Group | undefined): Group {
  const frozen = cloneGroup(baseline)
  if (!preferred) return frozen
  applyFieldPolicies(frozen, baseline, preferred, false)
  return frozen
}

/**
 * Lock Mode 中の基準グループと希望グループから、いま実際に適用される値のグループを返す。
 * 基準側が Lock Mode でなければ希望グループを、希望グループが無ければ基準グループを返す。
 */
export function resolveEffectiveGroup(baseline: Group, preferred: Group | undefined): Group {
  if (!preferred) return cloneGroup(baseline)
  if (!baseline.lockMode) return cloneGroup(preferred)

  const resolved = cloneGroup(baseline)
  applyFieldPolicies(resolved, baseline, preferred, true)
  return resolved
}

/**
 * Lock Mode により希望値がまだ適用されていないフィールドのキーを返す。
 * `identity` と `immediate` のフィールドは常に即時反映されるため対象外。
 */
export function getPendingGroupFieldKeys(baseline: Group, preferred: Group): Array<keyof Group> {
  if (!baseline.lockMode) return []
  const resolved = resolveEffectiveGroup(baseline, preferred)
  const normalizedPreferred = withPauseDefaults(preferred)
  return groupFieldKeys().filter((key) => {
    const policy = GROUP_FIELD_POLICIES[key]
    if (policy.kind === 'identity' || policy.kind === 'immediate') return false
    return !jsonEqual(resolved[key], normalizedPreferred[key])
  })
}

/**
 * いずれかのグループが Lock Mode ON なら true を返す。
 */
export function hasLockModeGroup(settings: Settings): boolean {
  return settings.groups.some((group) => group.lockMode)
}

/**
 * 希望設定から、Lock Mode ON の有効 group snapshot だけを次回 reset まで維持して合成する。
 */
export function mergeImmediateRestrictions(active: Settings, preferred: Settings): Settings {
  const preferredById = new Map(preferred.groups.map((group) => [group.id, group]))
  const mergedGroups: Group[] = []
  const handledIds = new Set<string>()

  for (const group of active.groups) {
    const preferredGroup = preferredById.get(group.id)
    if (group.lockMode) {
      mergedGroups.push(freezeBaselineGroup(group, preferredGroup))
      handledIds.add(group.id)
      continue
    }
    if (preferredGroup) {
      mergedGroups.push(cloneGroup(preferredGroup))
      handledIds.add(group.id)
    }
  }

  for (const preferredGroup of preferred.groups) {
    if (!handledIds.has(preferredGroup.id)) {
      mergedGroups.push(cloneGroup(preferredGroup))
    }
  }

  const lockModeExists = hasLockModeGroup(active) || hasLockModeGroup(preferred)
  return {
    global: {
      dailyResetHour: lockModeExists
        ? active.global.dailyResetHour
        : preferred.global.dailyResetHour,
      remainingTimeNotificationsEnabled: preferred.global.remainingTimeNotificationsEnabled,
      notificationThresholdMinutes: preferred.global.notificationThresholdMinutes,
    },
    groups: mergedGroups,
  }
}

/**
 * Lock Mode の有効スナップショットと希望設定に差分があり、次の rule day まで以前の制限が
 * 残るグループ ID を返す。
 */
export function getPendingEffectiveGroupIds(preferred: Settings, effective: Settings): string[] {
  const preferredById = new Map(preferred.groups.map((group) => [group.id, group]))
  return effective.groups.flatMap((effectiveGroup) => {
    if (!effectiveGroup.lockMode) return []
    const preferredGroup = preferredById.get(effectiveGroup.id)
    // 希望側に無い、または内容が一致しないグループは、基準側の制限が残っている。
    return jsonEqual(preferredGroup, effectiveGroup) ? [] : [effectiveGroup.id]
  })
}

/**
 * 現在時刻と設定のリセット時刻から、有効設定 state の初期値を作る。
 */
export function createEffectiveSettingsState(
  settings: Settings,
  now: Date,
): EffectiveSettingsState {
  return {
    effectiveSettings: cloneSettings(settings),
    effectiveSettingsLogicalDate: getLogicalDate(now, settings.global.dailyResetHour).logicalDate,
  }
}

/**
 * 論理日切替時は希望設定を丸ごと昇格し、それ以外は Lock Mode ON group だけを維持して反映する。
 */
export function reconcileEffectiveSettings(
  preferred: Settings,
  current: EffectiveSettingsState | undefined,
  now: Date,
): EffectiveSettingsState {
  if (!current) return createEffectiveSettingsState(preferred, now)

  const activeLogicalDate = getLogicalDate(
    now,
    current.effectiveSettings.global.dailyResetHour,
  ).logicalDate
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
  return getNextDailyResetAt(now, effectiveSettings.global)
}
