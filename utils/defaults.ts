import type { GlobalSettings, Group } from './types'

/**
 * 未設定時に使用するグローバル設定の既定値。SPEC.md 準拠。
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  redirectUrl: 'https://example.com',
  dailyResetHour: '00:00',
}

/**
 * 新規グループを生成する。`id` は crypto.randomUUID() で採番。
 * @param name グループ名。省略時は空文字。
 */
export function createEmptyGroup(name = ''): Group {
  return {
    id: crypto.randomUUID(),
    name,
    mode: 'blacklist',
    patterns: [],
    blockedTimeSlots: [],
    timeLimits: [],
  }
}
