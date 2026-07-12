import type { DelayGrantEntry, DelayGrantState } from './types'

/**
 * unknown の値から待機ゲート許可エントリを生成する。期限切れまたは空の値は undefined を返す。
 */
function normalizeDelayGrantEntry(value: unknown, now: number): DelayGrantEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const entry = value as Record<string, unknown>
  if (
    typeof entry.grantedUntil !== 'number' ||
    !Number.isFinite(entry.grantedUntil) ||
    entry.grantedUntil <= now
  ) {
    return undefined
  }
  return { grantedUntil: Math.floor(entry.grantedUntil) }
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { delayGrantState: {} }

  const validIds = validGroupIds ? new Set(validGroupIds) : undefined
  const delayGrantState: DelayGrantState['delayGrantState'] = {}
  for (const [groupId, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (validIds && !validIds.has(groupId)) continue
    const entry = normalizeDelayGrantEntry(entryValue, now)
    if (entry) delayGrantState[groupId] = entry
  }
  return { delayGrantState }
}
