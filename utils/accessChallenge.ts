import { isRecord } from './record'
import type { AccessChallenge } from './types'

/** 外部データの課題設定を安全な範囲に正規化する。 */
export function normalizeChallenge(value: unknown): AccessChallenge | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === 'typing') {
    return {
      type: 'typing',
      length:
        Number.isInteger(value.length) && Number(value.length) >= 12 && Number(value.length) <= 128
          ? Number(value.length)
          : 12,
      count:
        Number.isInteger(value.count) && Number(value.count) >= 1 && Number(value.count) <= 100
          ? Number(value.count)
          : 5,
    }
  }
  return undefined
}

/** 複数ルール・基準設定の課題を種類ごとの厳しい条件へまとめる。 */
export function mergeChallenges(challenges: AccessChallenge[]): AccessChallenge[] {
  const result: AccessChallenge[] = []
  for (const challenge of challenges) {
    const existing = result.find((item) => item.type === challenge.type)
    if (!existing) result.push({ ...challenge })
    else {
      existing.length = Math.max(existing.length, challenge.length)
      existing.count = Math.max(existing.count, challenge.count)
    }
  }
  return result
}

/** 紛らわしい字形を除いた英数字を生成する。 */
export function createChallengeText(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  return Array.from(
    crypto.getRandomValues(new Uint32Array(length)),
    (value) => alphabet[value % alphabet.length],
  ).join('')
}
