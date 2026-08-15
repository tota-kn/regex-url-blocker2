import { isRecord, normalizeEntryMap } from './record'
import type { DelayGrantEntry, DelayGrantState } from './types'

/**
 * unknown の値から待機ゲート許可エントリを生成する。期限切れまたは空の値は undefined を返す。
 */
function normalizeDelayGrantEntry(value: unknown, now: number): DelayGrantEntry | undefined {
  if (!isRecord(value)) return undefined

  if (
    typeof value.grantedUntil !== 'number' ||
    !Number.isFinite(value.grantedUntil) ||
    value.grantedUntil <= now
  ) {
    return undefined
  }
  return { grantedUntil: Math.floor(value.grantedUntil) }
}

/**
 * unknown の値から待機ゲート許可状態辞書を生成する。
 * 不正値・期限切れ値・指定された group id に存在しない値は除外する。
 */
export function normalizeDelayGrantState(
  value: unknown,
  validGroupIds?: Iterable<string>,
  now = Date.now(),
): DelayGrantState {
  return {
    delayGrantState: normalizeEntryMap(value, validGroupIds, (entryValue) =>
      normalizeDelayGrantEntry(entryValue, now),
    ),
  }
}
