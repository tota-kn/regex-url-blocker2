import type { GroupPauseEntry, Settings } from './types'
import { translate } from './i18n'

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
 * 指定グループが Pause 操作を許可しているかを、渡した設定のうち最も厳しい判定で返す。
 * 基準設定（有効設定）と希望設定のいずれかが禁止していれば false を返す。
 * これにより禁止は即時反映され、Lock Mode 中の再許可は次の rule day まで遅延する。
 */
export function isGroupPauseAllowed(groupId: string, settingsList: Settings[]): boolean {
  return settingsList.every((settings) => {
    const group = settings.groups.find((candidate) => candidate.id === groupId)
    return !group || group.pauseAllowed !== false
  })
}

/**
 * 基準設定に存在する group のうち、Pause 操作が許可されている group id を返す。
 */
export function getPauseAllowedGroupIds(baseline: Settings, preferred: Settings): string[] {
  return baseline.groups
    .filter((group) => isGroupPauseAllowed(group.id, [baseline, preferred]))
    .map((group) => group.id)
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
      label: translate('Paused {time}', { time: formatPauseDuration(pausedUntil - nowMs) }),
      kind: 'paused',
    }
  }

  const waitingUntil = entry?.waitingUntil
  if (waitingUntil && waitingUntil > nowMs) {
    return {
      label: translate('Pause {time} left', { time: formatPauseDuration(waitingUntil - nowMs) }),
      kind: 'waiting',
    }
  }

  if (waitingUntil) {
    return {
      label: translate('Pause ready'),
      kind: 'ready',
    }
  }

  return {
    label: translate('Pause'),
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
  // ボタンは待機中／ready を区別せず「一時停止中かどうか」だけを見せる。
  const display = getGroupPauseDisplayState(entry, now)
  const paused = display.kind === 'paused'
  return { label: paused ? display.label : translate('Pause'), paused }
}
