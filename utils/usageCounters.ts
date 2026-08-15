import { getLogicalDate } from './logicalDate'
import type { Settings, UsageCountersState } from './types'

/**
 * 2つの counter 状態が同じ group について同じ論理日・同じ消費秒数を持つなら true。
 * キーの列挙順は比較しない。
 */
export function countersEqual(a: UsageCountersState, b: UsageCountersState): boolean {
  const aIds = Object.keys(a.counters)
  const bIds = Object.keys(b.counters)
  if (aIds.length !== bIds.length) return false
  return aIds.every((groupId) => {
    const left = a.counters[groupId]
    const right = b.counters[groupId]
    return (
      right !== undefined &&
      left!.logicalDate === right.logicalDate &&
      left!.consumedSec === right.consumedSec
    )
  })
}

/** settings に合わせて counter を現在論理日に正規化し、削除済み group の値を除去する。 */
export function normalizeCounters(
  settings: Settings,
  counters: UsageCountersState,
  now: Date,
): UsageCountersState {
  const logicalDate = getLogicalDate(now, settings.global.dailyResetHour).logicalDate
  const normalized: UsageCountersState = { counters: {} }
  for (const group of settings.groups) {
    if (group.disabled) continue
    const current = counters.counters[group.id]
    normalized.counters[group.id] = {
      logicalDate,
      consumedSec:
        current?.logicalDate === logicalDate ? Math.max(0, Math.floor(current.consumedSec)) : 0,
    }
  }
  return normalized
}
