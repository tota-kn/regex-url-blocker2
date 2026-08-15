import type { ThemePreference } from './types'

/** 保存値として利用可能なテーマならそのまま返し、それ以外は自動配色へ戻す。 */
export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto'
}

/** 指定テーマを文書ルートへ適用する。`auto` の実際の配色解決は CSS に委ねる。 */
export function setTheme(preference: ThemePreference): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = preference
}

/** 保存済み設定を読み、Vue のマウント前にテーマを適用する。 */
export async function initializeTheme(): Promise<void> {
  const raw = (await browser.storage.sync.get('global')) as {
    global?: { theme?: unknown }
  }
  setTheme(normalizeTheme(raw.global?.theme))
}
