import { formatRemainingMinutesBadge, getMinimumEffectiveRemainingTimeLimit } from './usageCounters'
import type { SettingsPair } from './settingsPair'
import { collectTargetCandidates } from './targetCandidates'
import type { GroupPauseState, UsageCountersState } from './types'
import { translate } from './i18n'

export const ACTION_TITLE = 'Regex URL Guard'
export const BADGE_COLOR_NORMAL = '#2563eb'
export const BADGE_COLOR_WARNING = '#f59e0b'
export const BADGE_COLOR_BLOCKED = '#dc2626'
export const BADGE_COLOR_PAUSED = '#6b7280'

/** Action badge に反映する表示状態。 */
export interface ActionState {
  /** badge の短い表示文字列。 */
  text: string
  /** action tooltip。 */
  title: string
  /** badge 背景色。 */
  color: string
}

/** 残り秒数に応じた badge 背景色を返す。 */
export function badgeColor(remainingSec: number): string {
  if (remainingSec <= 0) return BADGE_COLOR_BLOCKED
  if (remainingSec <= 5 * 60) return BADGE_COLOR_WARNING
  return BADGE_COLOR_NORMAL
}

/** URL に一致する一時停止中のグループのうち、最も早く解除されるまでの残り秒数を返す。 */
function minimumPauseRemainingSec(
  pair: SettingsPair,
  pauseState: GroupPauseState,
  url: string | undefined,
  now: Date,
): number | undefined {
  const remaining = collectTargetCandidates(pair, url, (group) => {
    const ms = (pauseState.groupPauseState[group.id]?.pausedUntil ?? 0) - now.getTime()
    return ms > 0 ? ms : undefined
  }).map((candidate) => candidate.value)
  return remaining.length > 0 ? Math.min(...remaining) / 1_000 : undefined
}

/**
 * タブに表示すべき action badge/title 状態を作る。
 *
 * 対象サイトのグループが一時停止中なら、解除までの時間を残り時間の上限より優先して表示する。
 */
export function buildActionState(
  pair: SettingsPair,
  counters: UsageCountersState,
  pauseState: GroupPauseState,
  url: string | undefined,
  now: Date,
): ActionState {
  const pauseSec = minimumPauseRemainingSec(pair, pauseState, url, now)
  if (pauseSec !== undefined) {
    const text = formatRemainingMinutesBadge(pauseSec)
    return {
      text,
      title: translate('Regex URL Guard - paused {time}', { time: text }),
      color: BADGE_COLOR_PAUSED,
    }
  }
  const minimum = getMinimumEffectiveRemainingTimeLimit(
    pair.baseline,
    pair.preferred,
    counters,
    url,
    now,
  )
  if (!minimum) return { text: '', title: ACTION_TITLE, color: BADGE_COLOR_NORMAL }
  const text = formatRemainingMinutesBadge(minimum.summary.remainingSec)
  return {
    text,
    title: translate('Regex URL Guard - remaining {time}', { time: text }),
    color: badgeColor(minimum.summary.remainingSec),
  }
}
