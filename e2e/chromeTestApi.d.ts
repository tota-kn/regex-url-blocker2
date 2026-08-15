/** E2E のブラウザ／Service Worker コンテキストで利用する Chrome API の最小型。 */
interface ChromeTestStorageArea {
  /** storage の値を取得する。 */
  get: (keys?: string | string[]) => Promise<any>
  /** storage へ値を書き込む。 */
  set: (items: object) => Promise<void>
}

/** E2E で利用する Chrome API の最小型。 */
interface ChromeTestApi {
  /** extension storage API。 */
  storage: { local: ChromeTestStorageArea; sync: ChromeTestStorageArea }
  /** action badge API。 */
  action: { getBadgeText: (details: { tabId: number }) => Promise<string> }
  /** notification API。 */
  notifications: {
    getAll: () => Promise<Record<string, unknown>>
    clear: (notificationId: string) => Promise<boolean>
  }
  /** tab query API。 */
  tabs: { query: (query: object) => Promise<Array<{ id?: number }>> }
}

declare global {
  /** 拡張機能ページと Service Worker に注入される Chrome API。 */
  var chrome: ChromeTestApi
}

export {}
