import { evaluateUrl, getActiveRedirectUrl, getLogicalDate, getTimeLimitUsageSummary, type UrlEvaluation } from './blocking'
import type { Group, Settings, UsageCountersState, UsageNotificationEntry } from './types'

/**
 * Chrome notification を作成するための判定結果。
 */
export interface NotificationPlan {
  /** Chrome notification の ID。 */
  notificationId: string
  /** Chrome notification の本文。 */
  message: string
  /** 通知済みとして履歴へ記録する group と論理日の組。 */
  historyEntries: Array<{ groupId: string, logicalDate: string }>
}

/**
 * 残り秒数を通知本文向けの分数表記へ変換する。
 */
export function formatRemainingNotificationMinutes(remainingSec: number): string {
  const minutes = Math.ceil(remainingSec / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

/**
 * 指定グループ名を通知本文向けに結合する。
 */
export function formatGroupNames(groups: Array<{ name: string }>): string {
  return groups.map(group => group.name).join(', ')
}

/**
 * 通知履歴を見て、同じ論理日の未通知グループだけを返す。
 */
export function filterUnnotifiedGroups<T extends { id: string }>(
  groups: T[],
  logicalDateByGroupId: Map<string, string>,
  history: Record<string, UsageNotificationEntry>,
): T[] {
  return groups.filter((group) => {
    const logicalDate = logicalDateByGroupId.get(group.id)
    return Boolean(logicalDate) && history[group.id]?.logicalDate !== logicalDate
  })
}

/**
 * 通知計画に含まれる group を通知済み履歴へ記録する。
 */
export function markNotificationPlanHistory(plan: NotificationPlan, history: Record<string, UsageNotificationEntry>): void {
  for (const entry of plan.historyEntries) {
    history[entry.groupId] = { logicalDate: entry.logicalDate }
  }
}

/**
 * 閾値以下になった閲覧上限付きグループの残り時間通知計画を作る。
 */
export function buildRemainingTimeNotificationPlans(
  settings: Settings,
  counters: UsageCountersState,
  history: Record<string, UsageNotificationEntry>,
  tabUrl: string | undefined,
  now: Date,
): NotificationPlan[] {
  if (!settings.global.remainingTimeNotificationsEnabled) return []

  const thresholdSec = settings.global.notificationThresholdMinutes * 60
  const evaluation = evaluateUrl(settings, counters, tabUrl, now)
  const targetGroupIds = new Set(evaluation.targetGroupIds)
  const plans: NotificationPlan[] = []

  for (const group of settings.groups) {
    if (!targetGroupIds.has(group.id)) continue

    const summary = getTimeLimitUsageSummary(group, counters.counters[group.id], now, settings.global)
    if (!summary) continue
    if (summary.remainingSec <= 0 || summary.remainingSec > thresholdSec) continue
    if (history[group.id]?.logicalDate === summary.logicalDate) continue

    plans.push({
      notificationId: `usage-time-limit-${group.id}-${summary.logicalDate}`,
      message: `${group.name}: ${formatRemainingNotificationMinutes(summary.remainingSec)} remaining today.`,
      historyEntries: [{ groupId: group.id, logicalDate: summary.logicalDate }],
    })
  }

  return plans
}

/**
 * 閲覧上限付き対象ページを開いたときの通知計画を作る。
 */
export function buildPageOpenNotificationPlan(
  settings: Settings,
  counters: UsageCountersState,
  history: Record<string, UsageNotificationEntry>,
  evaluation: UrlEvaluation,
  now: Date,
): NotificationPlan | undefined {
  if (!settings.global.pageOpenNotificationsEnabled) return undefined
  if (evaluation.blocked) return undefined

  const targetGroupIds = new Set(evaluation.targetGroupIds)
  const groupsWithLimit = settings.groups.filter((group) => {
    if (!targetGroupIds.has(group.id)) return false
    return Boolean(getTimeLimitUsageSummary(group, counters.counters[group.id], now, settings.global))
  })
  const logicalDateByGroupId = new Map(groupsWithLimit.map((group) => {
    const summary = getTimeLimitUsageSummary(group, counters.counters[group.id], now, settings.global)
    return [group.id, summary?.logicalDate ?? '']
  }))
  const unnotifiedGroups = filterUnnotifiedGroups(groupsWithLimit, logicalDateByGroupId, history)
  if (unnotifiedGroups.length === 0) return undefined

  const logicalDate = logicalDateByGroupId.get(unnotifiedGroups[0].id) ?? getLogicalDate(now, settings.global.dailyResetHour).logicalDate
  return {
    notificationId: `page-open-limit-${logicalDate}-${unnotifiedGroups.map(group => group.id).sort().join('-')}`,
    message: `Time limit applies to ${formatGroupNames(unnotifiedGroups)} today.`,
    historyEntries: unnotifiedGroups.map(group => ({
      groupId: group.id,
      logicalDate: logicalDateByGroupId.get(group.id) ?? logicalDate,
    })),
  }
}

/**
 * redirect によるブロック発動時の通知計画を作る。
 */
export function buildRedirectBlockNotificationPlan(
  settings: Settings,
  history: Record<string, UsageNotificationEntry>,
  evaluation: UrlEvaluation,
  destinationUrl: string,
  now: Date,
): NotificationPlan | undefined {
  if (!settings.global.blockNotificationsEnabled) return undefined
  if (evaluation.blockedGroupIds.length === 0) return undefined

  const blockedGroupIds = new Set(evaluation.blockedGroupIds)
  const blockedGroups = settings.groups.filter((group: Group) =>
    blockedGroupIds.has(group.id)
    && ((group.blockAction === 'redirect' && group.redirectUrl === destinationUrl)
      || getActiveRedirectUrl(group, now, settings.global) === destinationUrl),
  )
  const logicalDate = getLogicalDate(now, settings.global.dailyResetHour).logicalDate
  const logicalDateByGroupId = new Map(blockedGroups.map(group => [group.id, logicalDate]))
  const unnotifiedGroups = filterUnnotifiedGroups(blockedGroups, logicalDateByGroupId, history)
  if (unnotifiedGroups.length === 0) return undefined

  return {
    notificationId: `redirect-block-${logicalDate}-${unnotifiedGroups.map(group => group.id).sort().join('-')}`,
    message: `Blocked and redirected: ${formatGroupNames(unnotifiedGroups)}.`,
    historyEntries: unnotifiedGroups.map(group => ({ groupId: group.id, logicalDate })),
  }
}
