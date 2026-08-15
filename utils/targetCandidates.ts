import { bothSettings, type SettingsPair } from './settingsPair'
import type { GlobalSettings, Group } from './types'
import { getTargetGroupIds } from './urlTargeting'

/** 二重評価で集めた、1グループ分の候補値。 */
export interface TargetCandidate<T> {
  /** 候補の出どころとなったグループ。 */
  group: Group
  /** そのグループが属していた設定のグローバル設定。 */
  global: GlobalSettings
  /** 候補値。 */
  value: T
}

/** 基準設定と希望設定を独立に評価し、URL対象グループごとの候補値を集める。 */
export function collectTargetCandidates<T>(
  pair: SettingsPair,
  url: string | undefined,
  pick: (group: Group, global: GlobalSettings) => T | undefined,
): TargetCandidate<T>[] {
  return bothSettings(pair).flatMap((settings) => {
    const targetIds = new Set(getTargetGroupIds(settings, url))
    return settings.groups.flatMap((group) => {
      if (!targetIds.has(group.id)) return []
      const value = pick(group, settings.global)
      return value === undefined ? [] : [{ group, global: settings.global, value }]
    })
  })
}
