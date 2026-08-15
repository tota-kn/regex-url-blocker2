import type { Settings } from './types'

/**
 * Lock Mode の二重評価で使う設定の組。
 *
 * 制限は「基準設定（今の rule day に凍結されたスナップショット）」と
 * 「希望設定（最新の保存値）」を**独立に評価し、厳しい方を採る**ことで決まる。
 * 強化した変更が即座に効き、緩和した変更は次の rule day まで遅れるのはこの仕組みによる。
 * 片方だけで成立した制限も有効なので、評価結果は必ず両方から集めること。
 */
export interface SettingsPair {
  /** 現在の rule day に凍結された基準設定。 */
  baseline: Settings
  /** 最新の保存値。 */
  preferred: Settings
}

/**
 * 基準設定と希望設定から組を作る。希望設定が未読み込みなら基準設定で代用する。
 */
export function settingsPair(baseline: Settings, preferred: Settings | undefined): SettingsPair {
  return { baseline, preferred: preferred ?? baseline }
}

/**
 * 組の両方を評価順（基準 → 希望）の配列として返す。
 */
export function bothSettings(pair: SettingsPair): Settings[] {
  return [pair.baseline, pair.preferred]
}

/**
 * `score` が最小（`'min'`）または最大（`'max'`）の要素を返す。空配列なら undefined。
 * 同点のときは先に現れた要素を返す。
 */
export function strictestBy<T>(
  items: T[],
  score: (item: T) => number,
  order: 'min' | 'max',
): T | undefined {
  let best: T | undefined
  let bestScore = order === 'min' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  for (const item of items) {
    const current = score(item)
    if (best === undefined || (order === 'min' ? current < bestScore : current > bestScore)) {
      best = item
      bestScore = current
    }
  }
  return best
}

/**
 * 組の両方から取り出した文字列を、重複なく結合して返す。
 */
export function unionOf(pair: SettingsPair, pick: (settings: Settings) => string[]): string[] {
  return [...new Set(bothSettings(pair).flatMap(pick))]
}
