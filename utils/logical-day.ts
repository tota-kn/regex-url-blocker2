/**
 * `HH:MM` 形式の文字列を、その日の 0:00 からの分数に変換する。
 * @example hhmmToMinutes('04:30') === 270
 */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(s => Number.parseInt(s, 10))
  return h * 60 + m
}

/**
 * 与えられた時刻と1日のリセット時刻から、論理日の `YYYY-MM-DD` 文字列をローカルタイムで返す。
 * リセット時刻より前の時間帯は「前日」扱い。
 */
export function getLogicalDate(now: Date, resetHHMM: string): string {
  const resetMin = hhmmToMinutes(resetHHMM)
  const shifted = new Date(now.getTime() - resetMin * 60_000)
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const d = String(shifted.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 与えられた時刻から、次の論理日の境界までのミリ秒を返す。
 */
export function msUntilNextLogicalDay(now: Date, resetHHMM: string): number {
  const resetMin = hhmmToMinutes(resetHHMM)
  const shifted = new Date(now.getTime() - resetMin * 60_000)
  const nextMidnightShifted = new Date(
    shifted.getFullYear(),
    shifted.getMonth(),
    shifted.getDate() + 1,
    0,
    0,
    0,
    0,
  )
  return nextMidnightShifted.getTime() - shifted.getTime()
}
