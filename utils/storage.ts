import { browser } from 'wxt/browser'
import type { AccumulatorMap, GlobalSettings, Group } from '@/utils/types'

const K_GROUPS = 'groups'
const K_SETTINGS = 'settings'
const K_ACCUMULATORS = 'accumulators'

const DEFAULT_SETTINGS: GlobalSettings = {
  redirectUrl: 'https://example.com',
  dailyResetHour: '00:00',
}

/**
 * `browser.storage.sync` からグループ一覧を取得する。未設定なら空配列を返す。
 */
export async function getGroups(): Promise<Group[]> {
  const result = await browser.storage.sync.get(K_GROUPS)
  return (result[K_GROUPS] as Group[] | undefined) ?? []
}

/**
 * グループ一覧を `browser.storage.sync` に保存する。
 */
export async function setGroups(groups: Group[]): Promise<void> {
  await browser.storage.sync.set({ [K_GROUPS]: groups })
}

/**
 * グローバル設定を `browser.storage.sync` から取得する。未設定はデフォルト値で補完する。
 */
export async function getSettings(): Promise<GlobalSettings> {
  const result = await browser.storage.sync.get(K_SETTINGS)
  const saved = result[K_SETTINGS] as Partial<GlobalSettings> | undefined
  return { ...DEFAULT_SETTINGS, ...saved }
}

/**
 * グローバル設定を `browser.storage.sync` に保存する。
 */
export async function setSettings(settings: GlobalSettings): Promise<void> {
  await browser.storage.sync.set({ [K_SETTINGS]: settings })
}

/**
 * 累積カウンタマップを `browser.storage.local` から取得する。
 */
export async function getAccumulators(): Promise<AccumulatorMap> {
  const result = await browser.storage.local.get(K_ACCUMULATORS)
  return (result[K_ACCUMULATORS] as AccumulatorMap | undefined) ?? {}
}

/**
 * 累積カウンタマップを `browser.storage.local` に保存する。
 */
export async function setAccumulators(map: AccumulatorMap): Promise<void> {
  await browser.storage.local.set({ [K_ACCUMULATORS]: map })
}

/** `browser.storage.onChanged` のコールバックで受け取る変更エントリ。 */
export interface StorageChange {
  newValue?: unknown
  oldValue?: unknown
}

/**
 * `browser.storage.onChanged` の `sync` エリアの変更を購読する。
 */
export function onSyncChange(
  cb: (changes: Record<string, StorageChange>) => void,
): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') cb(changes as Record<string, StorageChange>)
  })
}
