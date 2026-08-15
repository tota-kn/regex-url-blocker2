/** MV3 action APIのPromiseベース部分。 */
export interface ChromeActionPromiseApi {
  /** badge文字列を設定する。 */
  setBadgeText: (details: { tabId: number; text: string }) => Promise<void>
  /** tooltip titleを設定する。 */
  setTitle: (details: { tabId: number; title: string }) => Promise<void>
  /** badge背景色を設定する。 */
  setBadgeBackgroundColor: (details: { tabId: number; color: string }) => Promise<void>
}

/** Chrome notifications APIのPromiseベース部分。 */
export interface ChromeNotificationsPromiseApi {
  /** notificationを作成する。 */
  create: (
    notificationId: string,
    options: { type: 'basic'; iconUrl: string; title: string; message: string },
  ) => Promise<string>
}

/** backgroundが直接利用するChrome API。 */
export interface ChromePromiseApi {
  /** MV3 action API。 */
  action: ChromeActionPromiseApi
  /** notifications API。 */
  notifications: ChromeNotificationsPromiseApi
}

/** globalThisからbackground用Chrome APIを型付きで返す。 */
export function getChromeApi(): ChromePromiseApi {
  return (globalThis as unknown as { chrome: ChromePromiseApi }).chrome
}
