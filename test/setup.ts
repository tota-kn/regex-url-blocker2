import { beforeEach, vi } from 'vitest'

/**
 * browser.storage.sync を in-memory で再現するモック。
 * 各 test の前に store をクリアする。
 */
const syncStore = new Map<string, unknown>()
const localStore = new Map<string, unknown>()

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

vi.stubGlobal('browser', {
  storage: {
    sync: {
      get: vi.fn(async (keys: string[]) => getFromStore(syncStore, keys)),
      set: vi.fn(async (items: Record<string, unknown>) => setToStore(syncStore, items)),
    },
    local: {
      get: vi.fn(async (keys: string[]) => getFromStore(localStore, keys)),
      set: vi.fn(async (items: Record<string, unknown>) => setToStore(localStore, items)),
    },
  },
})

beforeEach(() => {
  syncStore.clear()
  localStore.clear()
})
