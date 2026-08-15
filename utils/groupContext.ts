import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'
import type { TimeLimitUsageSummary } from '@/utils/usageCounters'
import type { GlobalSettings, Group, GroupPauseEntry } from '@/utils/types'

/** グループカードが参照する Options 画面の読み取り専用派生情報。 */
export interface GroupContext {
  /** 現在のグローバル設定。 */
  globalSettings: Readonly<Ref<GlobalSettings>>
  /** 一時停止表示などの計算基準時刻。 */
  now: Readonly<Ref<Date>>
  /** 保留中の制限が反映される日時。 */
  appliesAfterLabel: Readonly<Ref<string>>
  /** 指定グループの一時停止状態を返す。 */
  pauseEntry: (groupId: string) => GroupPauseEntry | undefined
  /** 指定グループで Pause 操作を無効化する理由を返す。 */
  pauseDisabledReason: (groupId: string) => string | undefined
  /** 指定グループの基準スナップショットを返す。 */
  effectiveGroup: (groupId: string) => Group | undefined
  /** 指定グループの今日の上限利用状況を返す。 */
  timeLimitUsageSummary: (group: Group) => TimeLimitUsageSummary | undefined
}

/** Options 画面からグループカードへ派生情報を渡すキー。 */
export const GroupContextKey: InjectionKey<GroupContext> = Symbol('GroupContext')

/** 提供済みのグループコンテキストを返す。 */
export function useGroupContext(): GroupContext {
  const context = inject(GroupContextKey)
  if (!context) throw new Error('GroupContext is not provided')
  return context
}
