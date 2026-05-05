import { DEFAULT_GLOBAL_SETTINGS } from './defaults'
import type { GlobalSettings, Group, Settings } from './types'

/**
 * browser.storage.sync から `Settings` 全体を読み込む。
 * 未設定キーや欠損フィールドは `DEFAULT_GLOBAL_SETTINGS` で穴埋めする。
 */
export async function loadSettings(): Promise<Settings> {
  const raw = await browser.storage.sync.get(['global', 'groups']) as {
    global?: Partial<GlobalSettings>
    groups?: unknown
  }
  return {
    global: { ...DEFAULT_GLOBAL_SETTINGS, ...(raw.global ?? {}) },
    groups: Array.isArray(raw.groups) ? raw.groups as Group[] : [],
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
