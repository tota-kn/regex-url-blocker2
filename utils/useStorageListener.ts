import { onMounted, onUnmounted } from 'vue'

/** browser.storage.onChanged のリスナー型。 */
type StorageChangedListener = Parameters<typeof browser.storage.onChanged.addListener>[0]

/**
 * browser.storage.onChanged のリスナー登録・解除をコンポーネントの
 * ライフサイクル（mount / unmount）に合わせて行う composable。
 * @param listener ストレージ変更時に呼び出すリスナー。
 */
export function useStorageListener(listener: StorageChangedListener): void {
  onMounted(() => {
    browser.storage.onChanged.addListener(listener)
  })
  onUnmounted(() => {
    browser.storage.onChanged.removeListener(listener)
  })
}
