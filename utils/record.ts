/**
 * storage から読んだ `unknown` を安全に扱うためのレコード判定。
 *
 * `browser.storage` は任意の JSON を返しうるため、正規化処理の入口では必ず
 * 「配列でも null でもないオブジェクト」であることを確認してから読み進める。
 */

/**
 * 値が配列でないプレーンなオブジェクトなら true を返す。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * object 風の値を安全にレコードとして扱う。オブジェクトでなければ空レコードを返す。
 */
export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/**
 * group id をキーにしたエントリ辞書を正規化する。
 * `normalizeEntry` が undefined を返したキーと、`validGroupIds` に含まれないキーは除外する。
 * @param validGroupIds 残してよい group id。省略時は id で絞り込まない。
 */
export function normalizeEntryMap<T>(
  value: unknown,
  validGroupIds: Iterable<string> | undefined,
  normalizeEntry: (entryValue: unknown) => T | undefined,
): Record<string, T> {
  if (!isRecord(value)) return {}

  const validIds = validGroupIds ? new Set(validGroupIds) : undefined
  const entries: Record<string, T> = {}
  for (const [groupId, entryValue] of Object.entries(value)) {
    if (validIds && !validIds.has(groupId)) continue
    const entry = normalizeEntry(entryValue)
    if (entry !== undefined) entries[groupId] = entry
  }
  return entries
}

/**
 * 保存済み値を、下限を満たす整数へ正規化する。満たさない値は既定値へ丸める。
 */
export function normalizeInteger(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : fallback
}
