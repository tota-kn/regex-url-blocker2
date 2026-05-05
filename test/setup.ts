import { beforeEach, vi } from 'vitest'

/**
 * browser.storage.sync を in-memory で再現するモック。
 * 各 test の前に store をクリアする。
 */
const store = new Map<string, unknown>()

vi.stubGlobal('browser', {
  storage: {
    sync: {
      get: vi.fn(async (keys: string[]) => {
        const result: Record<string, unknown> = {}
        for (const k of keys) {
          if (store.has(k)) result[k] = store.get(k)
        }
        return result
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v)
      }),
    },
  },
})

beforeEach(() => {
  store.clear()
})
