import { formatRemainingMinutesBadge, getMinimumEffectiveRemainingTimeLimit } from './usageCounters'
import type { SettingsPair } from './settingsPair'
import type { UsageCountersState } from './types'
import { translate } from './i18n'

export const ACTION_TITLE = 'Regex URL Guard'
export const BADGE_COLOR_NORMAL = '#2563eb'
export const BADGE_COLOR_WARNING = '#f59e0b'
export const BADGE_COLOR_BLOCKED = '#dc2626'

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

/** タブに表示すべき action badge/title 状態を作る。 */
export function buildActionState(
  pair: SettingsPair,
  counters: UsageCountersState,
  url: string | undefined,
  now: Date,
): ActionState {
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
