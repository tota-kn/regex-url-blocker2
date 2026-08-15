import { useStorageListener } from './useStorageListener'

/** storage area内のキーと変更時処理の対応。 */
export type StorageWatchHandlers = Partial<Record<string, () => void | Promise<void>>>

/** storage areaごとの変更監視設定。 */
export interface StorageWatchMap {
  /** storage.localの監視。 */
  local?: StorageWatchHandlers
  /** storage.syncの監視。 */
  sync?: StorageWatchHandlers
}

/** 指定キーの変更時に対応する処理を呼ぶstorage監視composable。 */
export function useStorageWatch(watchMap: StorageWatchMap): void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    areaName,
  ) => {
    if (areaName !== 'local' && areaName !== 'sync') return
    const handlers = watchMap[areaName]
    if (!handlers) return
    const pending = new Set<() => void | Promise<void>>()
    for (const key of Object.keys(changes)) {
      const handler = handlers[key]
      if (handler) pending.add(handler)
    }
    for (const handler of pending) void handler()
  }
  useStorageListener(listener)
}
