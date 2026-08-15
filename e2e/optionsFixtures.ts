import { Buffer } from 'node:buffer'
import type { Worker } from '@playwright/test'
import { setExtensionStorage } from './helpers'
import { logicalDateId } from './logicalDate'

/** Playwright の file input に渡す JSON ファイル指定を生成する。 */
export function jsonUploadFile(
  name: string,
  value: unknown,
): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  }
}

/** E2E fixture 用の曜日別旧スキーマルールを生成する。 */
export function dailyRules(override: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
    ...override,
  }))
}

/** Lock Mode ON の Pause グループを希望設定と当日の基準設定へ保存する。 */
export async function seedLockedPauseGroup(serviceWorker: Worker): Promise<void> {
  const settings = {
    global: {
      dailyResetHour: '03:00',
      remainingTimeNotificationsEnabled: true,
      notificationThresholdMinutes: 5,
    },
    groups: [
      {
        id: 'locked-pause',
        name: 'Locked pause',
        mode: 'blacklist',
        disabled: false,
        lockMode: true,
        patterns: ['example\\.com'],
        pauseAllowed: true,
        pauseWaitSeconds: 5,
        pauseDurationMinutes: 7,
        rules: [
          {
            id: 'locked-pause-rule',
            window: { type: 'always' },
            restriction: { kind: 'block' },
            destination: { type: 'blockedPage' },
          },
        ],
      },
    ],
  }
  await setExtensionStorage(serviceWorker, 'local', {
    effectiveSettings: settings,
    effectiveSettingsLogicalDate: logicalDateId(new Date(), '03:00'),
  })
  await setExtensionStorage(serviceWorker, 'sync', settings)
}

/** 希望設定から削除済みだが当日の基準設定に残る Lock Mode グループを保存する。 */
export async function seedDeletedActiveGroup(serviceWorker: Worker): Promise<void> {
  const global = {
    dailyResetHour: '03:00',
    remainingTimeNotificationsEnabled: true,
    notificationThresholdMinutes: 5,
  }
  const deletedGroup = {
    id: 'deleted-active',
    name: 'Deleted active',
    mode: 'blacklist',
    disabled: false,
    lockMode: true,
    patterns: ['deleted\\.example'],
    pauseAllowed: true,
    rules: [
      {
        id: 'deleted-active-rule',
        window: { type: 'always' },
        restriction: { kind: 'block' },
        destination: { type: 'blockedPage' },
      },
    ],
  }
  await setExtensionStorage(serviceWorker, 'local', {
    effectiveSettings: { global, groups: [deletedGroup] },
    effectiveSettingsLogicalDate: logicalDateId(new Date(), '03:00'),
  })
  await setExtensionStorage(serviceWorker, 'sync', { global, groups: [] })
}
