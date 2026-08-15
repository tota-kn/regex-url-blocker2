import { collectTargetCandidates } from './targetCandidates'
import { getTimeLimitUsageSummary } from './usageCounters'
import type { Settings, UsageCountersState, UsageNotificationEntry } from './types'
import { translate } from './i18n'

/**
 * Chrome notification を作成するための判定結果。
 */
export interface NotificationPlan {
  /** Chrome notification の ID。 */
  notificationId: string
  /** Chrome notification の本文。 */
  message: string
  /** 通知済みとして履歴へ記録する group と論理日の組。 */
  historyEntries: Array<{ groupId: string; logicalDate: string }>
}

/**
 * 残り秒数を通知本文向けの分数表記へ変換する。
 */
function formatRemainingNotificationMinutes(remainingSec: number): string {
  const minutes = Math.ceil(remainingSec / 60)
  return translate('{count} minute | {count} minutes', { count: minutes })
}

/**
 * 通知計画に含まれる group を通知済み履歴へ記録する。
 */
export function markNotificationPlanHistory(
  plan: NotificationPlan,
  history: Record<string, UsageNotificationEntry>,
): void {
  for (const entry of plan.historyEntries) {
    history[entry.groupId] = { logicalDate: entry.logicalDate }
  }
}

/**
 * 基準設定と最新設定のうち、より短い残り時間だけをグループごとに通知する。
 */
export function buildEffectiveRemainingTimeNotificationPlans(
  baseline: Settings,
  preferred: Settings,
  counters: UsageCountersState,
  history: Record<string, UsageNotificationEntry>,
  tabUrl: string | undefined,
  now: Date,
): NotificationPlan[] {
  if (!preferred.global.remainingTimeNotificationsEnabled) return []
  const thresholdSec = preferred.global.notificationThresholdMinutes * 60

  const candidates = collectTargetCandidates({ baseline, preferred }, tabUrl, (group, global) =>
    getTimeLimitUsageSummary(group, counters.counters[group.id], now, global),
  )
  // 同じ group が両設定から挙がったときは、残り時間が短い側だけを通知する。
  const strictest = new Map<string, (typeof candidates)[number]>()
  for (const candidate of candidates) {
    const current = strictest.get(candidate.group.id)
    if (!current || candidate.value.remainingSec < current.value.remainingSec) {
      strictest.set(candidate.group.id, candidate)
    }
  }

  return [...strictest.values()].flatMap(({ group, value: summary }) => {
    if (summary.remainingSec <= 0 || summary.remainingSec > thresholdSec) return []
    if (history[group.id]?.logicalDate === summary.logicalDate) return []
    return [
      {
        notificationId: `usage-time-limit-${group.id}-${summary.logicalDate}`,
        message: translate('{group}: {minutes} remaining today.', {
          group: group.name,
          minutes: formatRemainingNotificationMinutes(summary.remainingSec),
        }),
        historyEntries: [{ groupId: group.id, logicalDate: summary.logicalDate }],
      },
    ]
  })
}
