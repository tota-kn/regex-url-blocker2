import type { Accumulator } from '@/utils/types'
import { getLogicalDate } from '@/utils/logical-day'

/**
 * 1秒分の消費を加算した新しい accumulator を返す。
 * 論理日が変わっていた場合は consumedSec を 1 にリセットしてから返す。
 */
export function tickAccumulator(
  prev: Accumulator | undefined,
  now: Date,
  resetHHMM: string,
): Accumulator {
  const logicalDate = getLogicalDate(now, resetHHMM)
  if (!prev || prev.logicalDate !== logicalDate) {
    return { logicalDate, consumedSec: 1 }
  }
  return { logicalDate, consumedSec: prev.consumedSec + 1 }
}

/**
 * 論理日を最新化した accumulator を返す（消費加算なし）。
 * undefined の場合は consumedSec: 0 で初期化する。
 */
export function ensureToday(
  prev: Accumulator | undefined,
  now: Date,
  resetHHMM: string,
): Accumulator {
  const logicalDate = getLogicalDate(now, resetHHMM)
  if (!prev || prev.logicalDate !== logicalDate) {
    return { logicalDate, consumedSec: 0 }
  }
  return prev
}
