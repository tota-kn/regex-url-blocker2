import type { AllowedHourRange } from '@/utils/types'
import { hhmmToMinutes } from '@/utils/logical-day'

/**
 * 指定した時刻が許可時間帯レンジのいずれかに含まれるかを返す。
 * 空配列の場合は 24 時間 OK（常に `true`）。
 * `end <= start` は日跨ぎレンジ（例 22:00–06:00）として扱う。
 */
export function isWithinAllowedHours(now: Date, ranges: AllowedHourRange[]): boolean {
  if (ranges.length === 0) return true
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return ranges.some(({ start, end }) => {
    const s = hhmmToMinutes(start)
    const e = hhmmToMinutes(end)
    if (s === e) return false
    if (s < e) return nowMin >= s && nowMin < e
    // 日跨ぎ: [s, 1440) ∪ [0, e)
    return nowMin >= s || nowMin < e
  })
}
