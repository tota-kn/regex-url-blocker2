/**
 * JSON 互換の値に対する複製・等価判定・重複除去。
 *
 * 設定値・カウンタ・ルールはいずれも storage へそのまま載る JSON 互換の構造なので、
 * 構造的な同一性は JSON シリアライズで判定できる。判定方法を1箇所に集約し、
 * 呼び出し側が `JSON.stringify` を直接書かないようにする。
 */

/**
 * JSON 互換の値を deep clone する。
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * JSON 互換の値同士が構造的に同一なら true を返す。
 * キーの並び順が違う場合は false になるため、順序が保証できない値には使わない。
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * JSON 互換の値の配列から、構造的に同一な重複を取り除く。最初に現れた要素を残す。
 */
export function uniqueByJson<T>(values: T[]): T[] {
  return [...new Map(values.map((value) => [JSON.stringify(value), value])).values()]
}
