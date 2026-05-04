/**
 * 秒数を `M:SS` 形式の文字列に変換する。
 * @example formatMSS(90) === "1:30"
 */
export function formatMSS(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 秒数を `H:MM:SS` 形式の文字列に変換する。
 */
export function formatHMMSS(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
