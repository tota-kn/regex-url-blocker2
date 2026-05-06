import { DEFAULT_GLOBAL_SETTINGS } from './defaults'
import type { BlockedTimeSlot, GlobalSettings, Group, GroupMode, Settings, TimeLimit } from './types'

/**
 * browser.storage.sync から `Settings` 全体を読み込む。
 * 未設定キーや欠損フィールドは `DEFAULT_GLOBAL_SETTINGS` で穴埋めする。
 * 旧フォーマット（`schedules`）は破棄し `blockedTimeSlots` / `timeLimits` で初期化する。
 */
export async function loadSettings(): Promise<Settings> {
  const raw = await browser.storage.sync.get(['global', 'groups']) as {
    global?: Partial<GlobalSettings>
    groups?: unknown
  }
  const groups: Group[] = Array.isArray(raw.groups)
    ? (raw.groups as Record<string, unknown>[]).map(g => ({
        id: typeof g.id === 'string' ? g.id : crypto.randomUUID(),
        name: typeof g.name === 'string' ? g.name : '',
        mode: (g.mode === 'blacklist' || g.mode === 'whitelist' ? g.mode : 'blacklist') as GroupMode,
        patterns: Array.isArray(g.patterns) ? (g.patterns as string[]) : [],
        blockedTimeSlots: Array.isArray(g.blockedTimeSlots) ? (g.blockedTimeSlots as BlockedTimeSlot[]) : [],
        timeLimits: Array.isArray(g.timeLimits) ? (g.timeLimits as TimeLimit[]) : [],
      }))
    : []
  return {
    global: { ...DEFAULT_GLOBAL_SETTINGS, ...(raw.global ?? {}) },
    groups,
  }
}

/**
 * browser.storage.sync に `Settings` 全体を書き込む。
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.sync.set({
    global: settings.global,
    groups: settings.groups,
  })
}
