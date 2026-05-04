import { tickAccumulator } from '@/utils/accumulator'
import { matchesAny, shouldSkipUrl } from '@/utils/regex-match'
import { getAccumulatorsCache, getCompiled, getGroupsCache, getSettingsCache, setAccumulator } from '@/utils/bg-state'
import { decideGroupBlock } from '@/utils/block-decision'

let _isFocused = true
let _idleState: 'active' | 'idle' | 'locked' = 'active'
let _activeTabUrl: string | null = null
let _activeTabId: number | null = null

/** ウィンドウのフォーカス状態を更新する。 */
export function setFocused(focused: boolean): void {
  _isFocused = focused
}

/** idle 状態を更新する。 */
export function setIdleState(state: 'active' | 'idle' | 'locked'): void {
  _idleState = state
}

/** アクティブタブの URL と ID を更新する。 */
export function setActiveTab(url: string | null, tabId: number | null): void {
  _activeTabUrl = url
  _activeTabId = tabId
}

/** アクティブタブ ID を返す。 */
export function getActiveTabId(): number | null {
  return _activeTabId
}

/** 計測対象かどうかを返す。 */
export function isEligibleToTick(): boolean {
  return _isFocused && _idleState === 'active' && _activeTabUrl !== null
}

/**
 * 1秒分のティックを処理する。
 * 条件を満たす場合、マッチするすべてのグループの累積秒数を加算し、
 * 上限を超えたグループがあれば true を返す（リダイレクトが必要なことを示す）。
 */
export function onSecondTick(now: Date): boolean {
  if (!isEligibleToTick() || !_activeTabUrl) return false

  const url = _activeTabUrl
  const settings = getSettingsCache()
  if (shouldSkipUrl(url, settings.redirectUrl)) return false

  const groups = getGroupsCache()
  const accumulators = getAccumulatorsCache()
  let shouldRedirect = false

  for (const group of groups) {
    const compiled = getCompiled(group.id)
    if (!matchesAny(url, compiled)) continue

    const next = tickAccumulator(accumulators[group.id], now, settings.dailyResetHour)
    setAccumulator(group.id, next.consumedSec, next.logicalDate)

    const decision = decideGroupBlock(group, next, now)
    if (decision.blocked) shouldRedirect = true
  }

  return shouldRedirect
}
