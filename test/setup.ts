import { beforeEach, vi } from 'vitest'

/**
 * browser.storage.sync を in-memory で再現するモック。
 * 各 test の前に store をクリアする。
 */
const syncStore = new Map<string, unknown>()
const localStore = new Map<string, unknown>()

/** storage.onChanged に登録されたリスナー。 */
const storageChangedListeners = new Set<
  (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void
>()

/**
 * 指定された in-memory store から browser.storage.get 相当の値を返す。
 */
async function getFromStore(
  store: Map<string, unknown>,
  keys: string[],
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  for (const k of keys) {
    if (store.has(k)) result[k] = store.get(k)
  }
  return result
}

/**
 * 指定された in-memory store に browser.storage.set 相当の値を書き込む。
 */
async function setToStore(
  store: Map<string, unknown>,
  items: Record<string, unknown>,
): Promise<void> {
  for (const [k, v] of Object.entries(items)) store.set(k, v)
}

/** 指定された in-memory store からキーを削除する。 */
async function removeFromStore(
  store: Map<string, unknown>,
  keys: string | string[],
): Promise<void> {
  for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key)
}

/** テストから storage.onChanged を発火する。 */
export function emitStorageChanged(
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: 'local' | 'sync',
): void {
  for (const listener of storageChangedListeners) listener(changes, areaName)
}

vi.stubGlobal('browser', {
  storage: {
    sync: {
      get: vi.fn(async (keys: string[]) => getFromStore(syncStore, keys)),
      set: vi.fn(async (items: Record<string, unknown>) => setToStore(syncStore, items)),
      remove: vi.fn(async (keys: string | string[]) => removeFromStore(syncStore, keys)),
    },
    local: {
      get: vi.fn(async (keys: string[]) => getFromStore(localStore, keys)),
      set: vi.fn(async (items: Record<string, unknown>) => setToStore(localStore, items)),
      remove: vi.fn(async (keys: string | string[]) => removeFromStore(localStore, keys)),
    },
    onChanged: {
      addListener: vi.fn((listener) => storageChangedListeners.add(listener)),
      removeListener: vi.fn((listener) => storageChangedListeners.delete(listener)),
    },
  },
})

beforeEach(() => {
  syncStore.clear()
  localStore.clear()
  storageChangedListeners.clear()
})
