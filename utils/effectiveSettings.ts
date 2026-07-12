import { getLogicalDate } from './blocking'
import { cloneGroup, cloneSettings } from './groups'
import type { EffectiveSettingsState, Group, Settings } from './types'

/**
 * JSON 化できる設定値同士が同一なら true を返す。
 */
function settingsEqual(a: Settings, b: Settings): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
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
      const baseline = cloneGroup(group)
      if (preferredGroup) {
        baseline.name = preferredGroup.name
        baseline.blockAction = preferredGroup.blockAction
        baseline.redirectUrl = preferredGroup.redirectUrl
      }
      mergedGroups.push(baseline)
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
      blockAction: preferred.global.blockAction,
      redirectUrl: preferred.global.redirectUrl,
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
    const isPending =
      !preferredGroup ||
      !settingsEqual(
        { global: preferred.global, groups: [preferredGroup] },
        { global: preferred.global, groups: [effectiveGroup] },
      )
    return isPending ? [effectiveGroup.id] : []
  })
}

/**
 * Lock Mode ON のグループ変更で、翌日まで待つ必要がある差分が残っているなら true を返す。
 */
export function hasPendingEffectiveSettings(preferred: Settings, effective: Settings): boolean {
  return getPendingEffectiveGroupIds(preferred, effective).length > 0
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
  const [hour = '0', minute = '0'] = effectiveSettings.global.dailyResetHour.split(':')
  const resetAt = new Date(now)
  resetAt.setHours(Number(hour), Number(minute), 0, 0)
  if (resetAt.getTime() <= now.getTime()) {
    resetAt.setDate(resetAt.getDate() + 1)
  }
  return resetAt
}
