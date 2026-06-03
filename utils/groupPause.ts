import type { GroupPauseEntry } from './types'

/**
 * グループ一時停止 UI の表示状態。
 */
export interface GroupPauseButtonState {
  /** UI に表示するラベル。 */
  label: string
  /** 一時停止中の状態表示なら true。 */
  paused: boolean
}

/**
 * milliseconds を M:SS 形式に丸め上げて表示する。
 */
function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

/**
 * 一時停止状態から表示ラベルと状態種別を返す。
 */
export function getGroupPauseButtonState(entry: GroupPauseEntry | undefined, now: Date): GroupPauseButtonState {
  const nowMs = now.getTime()
  const pausedUntil = entry?.pausedUntil
  if (pausedUntil && pausedUntil > nowMs) {
    return {
      label: `Paused ${formatDuration(pausedUntil - nowMs)}`,
      paused: true,
    }
  }

  return {
    label: 'Request pause',
    paused: false,
  }
}
