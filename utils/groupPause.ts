import type { GroupPauseEntry } from './types'

/**
 * グループ一時停止ボタンの表示状態。
 */
export interface GroupPauseButtonState {
  /** ボタンに表示するラベル。 */
  label: string
  /** クリック可能なら true。 */
  clickable: boolean
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
 * 一時停止状態からボタンのラベルとクリック可否を返す。
 */
export function getGroupPauseButtonState(entry: GroupPauseEntry | undefined, now: Date): GroupPauseButtonState {
  const nowMs = now.getTime()
  const pausedUntil = entry?.pausedUntil
  if (pausedUntil && pausedUntil > nowMs) {
    return {
      label: `Paused ${formatDuration(pausedUntil - nowMs)}`,
      clickable: false,
    }
  }

  const waitingUntil = entry?.waitingUntil
  if (!waitingUntil) {
    return {
      label: 'Request 10 min pause',
      clickable: true,
    }
  }

  const remainingMs = waitingUntil - nowMs
  if (remainingMs > 0) {
    return {
      label: `Wait ${Math.ceil(remainingMs / 1_000)}s`,
      clickable: false,
    }
  }

  return {
    label: 'Pause for 10 min',
    clickable: true,
  }
}
