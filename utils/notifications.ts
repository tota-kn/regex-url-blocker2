import { evaluateUrl, getTimeLimitUsageSummary } from './blocking'
import type { Settings, UsageCountersState, UsageNotificationEntry } from './types'

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
export function formatRemainingNotificationMinutes(remainingSec: number): string {
  const minutes = Math.ceil(remainingSec / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
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
  const candidates = [baseline, preferred].flatMap((settings) => {
    const targetIds = new Set(evaluateUrl(settings, counters, tabUrl, now).targetGroupIds)
    return settings.groups.flatMap((group) => {
      if (!targetIds.has(group.id)) return []
      const summary = getTimeLimitUsageSummary(
        group,
        counters.counters[group.id],
        now,
        settings.global,
      )
      return summary ? [{ group, summary }] : []
    })
  })
  const strictest = new Map<string, (typeof candidates)[number]>()
  for (const candidate of candidates) {
    const current = strictest.get(candidate.group.id)
    if (!current || candidate.summary.remainingSec < current.summary.remainingSec) {
      strictest.set(candidate.group.id, candidate)
    }
  }
  return [...strictest.values()].flatMap(({ group, summary }) => {
    if (summary.remainingSec <= 0 || summary.remainingSec > thresholdSec) return []
    if (history[group.id]?.logicalDate === summary.logicalDate) return []
    return [
      {
        notificationId: `usage-time-limit-${group.id}-${summary.logicalDate}`,
        message: `${group.name}: ${formatRemainingNotificationMinutes(summary.remainingSec)} remaining today.`,
        historyEntries: [{ groupId: group.id, logicalDate: summary.logicalDate }],
      },
    ]
  })
}
