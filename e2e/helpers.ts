import { createServer, type RequestListener, type Server } from 'node:http'
import { expect, type Page, type Worker } from '@playwright/test'
import type { Settings } from '../utils/types'

/** E2E 用 HTTP サーバーの参照。 */
export interface TestServer {
  /** 起動したサーバーの origin。 */
  origin: string
  /** サーバーと既存接続を終了する。 */
  close: () => Promise<void>
}

/** HTTP サーバーと既存接続を終了する。 */
export async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/** E2E 用 HTTP サーバーを空きポートで起動する。 */
export async function startTestServer(listener?: RequestListener): Promise<TestServer> {
  const server = createServer(
    listener ??
      ((req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(`<!doctype html><title>${req.url}</title><main>${req.url}</main>`)
      }),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to start test server')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

/** redirect によって中断される可能性がある navigation を実行する。 */
export async function gotoAndWaitForUrl(
  page: Page,
  url: string,
  expectedUrl: string | RegExp,
): Promise<void> {
  await page.goto(url, { waitUntil: 'commit' }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('net::ERR_ABORTED')) return null
    throw error
  })
  await expect(page).toHaveURL(expectedUrl)
}

/** Service Worker から extension storage の指定領域を読み取る。 */
export async function getExtensionStorage(
  serviceWorker: Worker,
  area: 'local' | 'sync',
  keys?: string[],
): Promise<Record<string, unknown>> {
  return serviceWorker.evaluate(
    async ({ area, keys }) => {
      return globalThis.chrome.storage[area].get(keys)
    },
    { area, keys },
  )
}

/** Service Worker から extension storage の指定領域へ値を書き込む。 */
export async function setExtensionStorage(
  serviceWorker: Worker,
  area: 'local' | 'sync',
  items: object,
): Promise<void> {
  await serviceWorker.evaluate(
    async ({ area, items }) => {
      await globalThis.chrome.storage[area].set(items)
    },
    { area, items },
  )
}

/** 希望設定と当日の有効設定スナップショットを同時に保存する。 */
export async function savePreferredAndEffectiveSettings(
  serviceWorker: Worker,
  preferred: Settings,
  effective: Settings,
  effectiveSettingsLogicalDate: string,
): Promise<void> {
  await setExtensionStorage(serviceWorker, 'local', {
    effectiveSettings: effective,
    effectiveSettingsLogicalDate,
  })
  await savePreferredSettings(serviceWorker, preferred)
}

/** 希望設定を storage.sync へ保存する。 */
export async function savePreferredSettings(
  serviceWorker: Worker,
  preferred: Settings,
): Promise<void> {
  await setExtensionStorage(serviceWorker, 'sync', {
    global: preferred.global,
    groups: preferred.groups,
  })
}

/** 現在の storage.sync 設定を background が有効設定へ反映するまで待つ。 */
export async function waitForEffectiveSettings(serviceWorker: Worker): Promise<void> {
  const preferred = await getExtensionStorage(serviceWorker, 'sync', ['global', 'groups'])
  const preferredGlobal = preferred.global as Record<string, unknown> | undefined
  const preferredGroups = preferred.groups as Array<Record<string, unknown>> | undefined
  await expect
    .poll(async () => {
      const stored = await getExtensionStorage(serviceWorker, 'local', ['effectiveSettings'])
      const effective = stored.effectiveSettings as
        | { global?: Record<string, unknown>; groups?: Array<Record<string, unknown>> }
        | undefined
      const effectiveGroups = effective?.groups ?? []
      return {
        dailyResetHour: effective?.global?.dailyResetHour,
        preferredGroupIds: (preferredGroups ?? [])
          .filter((preferredGroup) =>
            effectiveGroups.some((effectiveGroup) => effectiveGroup.id === preferredGroup.id),
          )
          .map((group) => group.id),
        unexpectedUnlockedGroupIds: effectiveGroups
          .filter(
            (effectiveGroup) =>
              !effectiveGroup.lockMode &&
              !preferredGroups?.some((preferredGroup) => preferredGroup.id === effectiveGroup.id),
          )
          .map((group) => group.id),
      }
    })
    .toEqual({
      dailyResetHour: preferredGlobal?.dailyResetHour ?? '03:00',
      preferredGroupIds: (preferredGroups ?? []).map((group) => group.id),
      unexpectedUnlockedGroupIds: [],
    })
}
