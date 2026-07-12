import { createServer, type RequestListener, type Server } from 'node:http'
import { expect, type Page, type Worker } from '@playwright/test'

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
  await Promise.all([
    page.waitForURL(expectedUrl),
    page.goto(url, { waitUntil: 'commit' }).catch((error: unknown) => {
      if (error instanceof Error && error.message.includes('net::ERR_ABORTED')) return null
      throw error
    }),
  ])
}

/** @deprecated 遷移先を assertion できる gotoAndWaitForUrl を使用する。 */
export async function gotoPossiblyRedirected(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'commit' }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('net::ERR_ABORTED')) return null
    throw error
  })
}

/** Service Worker から extension storage の指定領域を読み取る。 */
export async function getExtensionStorage(
  serviceWorker: Worker,
  area: 'local' | 'sync',
  keys?: string[],
): Promise<Record<string, unknown>> {
  return serviceWorker.evaluate(
    async ({ area, keys }) => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: { get: (keys?: string[]) => Promise<Record<string, unknown>> }
            sync: { get: (keys?: string[]) => Promise<Record<string, unknown>> }
          }
        }
      }
      return chromeApi.chrome.storage[area].get(keys)
    },
    { area, keys },
  )
}

/** storage.sync の設定を保存し、background の effectiveSettings 反映まで待つ。 */
export async function saveSettingsAndWait(
  serviceWorker: Worker,
  settings: { global: Record<string, unknown>; groups: Array<Record<string, unknown>> },
): Promise<void> {
  await serviceWorker.evaluate(async (settings) => {
    const chromeApi = globalThis as unknown as {
      chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
    }
    await chromeApi.chrome.storage.sync.set(settings)
  }, settings)

  await expect
    .poll(async () => {
      const stored = await getExtensionStorage(serviceWorker, 'local', ['effectiveSettings'])
      const effective = stored.effectiveSettings as
        | { global?: Record<string, unknown>; groups?: Array<Record<string, unknown>> }
        | undefined
      return {
        dailyResetHour: effective?.global?.dailyResetHour,
        groupIds: effective?.groups?.map((group) => group.id),
      }
    })
    .toEqual({
      dailyResetHour: settings.global.dailyResetHour,
      groupIds: settings.groups.map((group) => group.id),
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

/** storage の値が期待する部分値を含むまで待つ。 */
export async function expectExtensionStorage(
  serviceWorker: Worker,
  area: 'local' | 'sync',
  expected: Record<string, unknown>,
): Promise<void> {
  await expect
    .poll(() => getExtensionStorage(serviceWorker, area, Object.keys(expected)))
    .toEqual(expect.objectContaining(expected))
}
