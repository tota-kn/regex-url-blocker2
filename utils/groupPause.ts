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
 * popup で表示するグループ一時停止状態。
 */
export interface GroupPauseDisplayState {
  /** UI に表示するラベル。 */
  label: string
  /** 一時停止状態の種別。 */
  kind: 'none' | 'paused' | 'waiting' | 'ready'
}

/**
 * milliseconds を M:SS 形式に丸め上げて表示する。
 */
export function formatPauseDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

/**
 * 一時停止状態から popup 用の表示ラベルと状態種別を返す。
 */
export function getGroupPauseDisplayState(
  entry: GroupPauseEntry | undefined,
  now: Date,
): GroupPauseDisplayState {
  const nowMs = now.getTime()
  const pausedUntil = entry?.pausedUntil
  if (pausedUntil && pausedUntil > nowMs) {
    return {
      label: `Paused ${formatPauseDuration(pausedUntil - nowMs)}`,
      kind: 'paused',
    }
  }

  const waitingUntil = entry?.waitingUntil
  if (waitingUntil && waitingUntil > nowMs) {
    return {
      label: `Request pause ${formatPauseDuration(waitingUntil - nowMs)} left`,
      kind: 'waiting',
    }
  }

  if (waitingUntil) {
    return {
      label: 'Request pause ready',
      kind: 'ready',
    }
  }

  return {
    label: 'Request pause',
    kind: 'none',
  }
}

/**
 * 一時停止状態から表示ラベルと状態種別を返す。
 */
export function getGroupPauseButtonState(
  entry: GroupPauseEntry | undefined,
  now: Date,
): GroupPauseButtonState {
  const nowMs = now.getTime()
  const pausedUntil = entry?.pausedUntil
  if (pausedUntil && pausedUntil > nowMs) {
    return {
      label: `Paused ${formatPauseDuration(pausedUntil - nowMs)}`,
      paused: true,
    }
  }

  return {
    label: 'Request pause',
    paused: false,
  }
}
