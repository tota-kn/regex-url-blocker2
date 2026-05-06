import { createServer, type Server } from 'node:http'
import type { Page, Worker } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Service Worker 経由で指定タブのアクション badge テキストを取得する。
 */
async function getBadgeText(serviceWorker: Worker, tabId: number): Promise<string> {
  return serviceWorker.evaluate(async (id) => {
    const chrome = (globalThis as unknown as {
      chrome: { action: { getBadgeText: (d: { tabId: number }) => Promise<string> } }
    }).chrome
    return chrome.action.getBadgeText({ tabId: id })
  }, tabId)
}

/**
 * Service Worker 経由で指定 URL を持つタブの ID を取得する。
 */
async function getTabIdByUrl(serviceWorker: Worker, url: string): Promise<number | undefined> {
  return serviceWorker.evaluate(async (targetUrl) => {
    const chrome = (globalThis as unknown as {
      chrome: { tabs: { query: (q: object) => Promise<Array<{ id?: number }>> } }
    }).chrome
    const tabs = await chrome.tabs.query({ url: targetUrl })
    return tabs[0]?.id
  }, url)
}

/**
 * テスト用 HTTP サーバーを起動する。
 */
async function startServer(): Promise<{ origin: string, close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (req.url === '/spa') {
      res.end('<!doctype html><button id="go">go</button><script>document.getElementById("go").onclick = () => history.pushState({}, "", "/target")</script>')
      return
    }
    res.end(`<!doctype html><title>${req.url}</title><main>${req.url}</main>`)
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start test server')
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => closeServer(server),
  }
}

/**
 * HTTP サーバーを停止する。
 */
async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/**
 * Service Worker 上の storage.sync に即ブロック設定を書き込む。
 */
async function saveBlockingSettings(serviceWorker: Worker, origin: string): Promise<void> {
  await saveBlockingSettingsWithPattern(serviceWorker, origin, `^${origin.replaceAll('.', '\\.')}`)
}

/**
 * Service Worker 上の storage.sync に指定 pattern の即ブロック設定を書き込む。
 */
async function saveBlockingSettingsWithPattern(serviceWorker: Worker, origin: string, pattern: string): Promise<void> {
  await serviceWorker.evaluate(async (settings) => {
    const chromeApi = globalThis as unknown as {
      chrome: {
        storage: {
          sync: {
            set: (items: Record<string, unknown>) => Promise<void>
          }
        }
      }
    }
    await chromeApi.chrome.storage.sync.set({
      global: {
        blockAction: 'redirect',
        redirectUrl: `${settings.origin}/blocked`,
        dailyResetHour: '00:00',
      },
      groups: [{
        id: 'block-local',
        name: 'Block local',
        mode: 'blacklist',
        patterns: [settings.pattern],
        blockedTimeSlots: [],
        timeLimits: [{ daysOfWeek: [], dailyMinutes: 0 }],
      }],
    })
  }, { origin, pattern })
}

/**
 * Service Worker 上の storage.sync に拡張ページ表示用の即ブロック設定を書き込む。
 */
async function saveBlockedPageSettings(serviceWorker: Worker, origin: string, groups: Array<{ id: string, name: string }>): Promise<void> {
  await serviceWorker.evaluate(async (settings) => {
    const chromeApi = globalThis as unknown as {
      chrome: {
        storage: {
          sync: {
            set: (items: Record<string, unknown>) => Promise<void>
          }
        }
      }
    }
    await chromeApi.chrome.storage.sync.set({
      global: {
        blockAction: 'blockedPage',
        redirectUrl: `${settings.origin}/blocked`,
        dailyResetHour: '00:00',
      },
      groups: settings.groups.map(group => ({
        id: group.id,
        name: group.name,
        mode: 'blacklist',
        patterns: [`^${settings.origin.replaceAll('.', '\\.')}`],
        blockedTimeSlots: [],
        timeLimits: [{ daysOfWeek: [], dailyMinutes: 0 }],
      })),
    })
  }, { origin, groups })
}

/**
 * redirect で中断されうる navigation を実行する。
 */
async function gotoPossiblyRedirected(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url)
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('net::ERR_ABORTED')) return
    throw error
  }
}

/**
 * Service Worker 上の storage.sync から現在の blockAction を読む。
 */
async function getStoredBlockAction(serviceWorker: Worker): Promise<unknown> {
  return serviceWorker.evaluate(async () => {
    const chromeApi = globalThis as unknown as {
      chrome: {
        storage: {
          sync: {
            get: (keys: string[]) => Promise<{ global?: { blockAction?: unknown } }>
          }
        }
      }
    }
    const result = await chromeApi.chrome.storage.sync.get(['global'])
    return result.global?.blockAction
  })
}

test.describe('Background blocking', () => {
  test('該当 URL への新規ナビゲーションを redirectUrl に書き換える', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await saveBlockingSettings(serviceWorker, server.origin)
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)
    }
    finally {
      await server.close()
    }
  })

  test('redirectUrl 自体と extension URL はリダイレクトしない', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await saveBlockingSettings(serviceWorker, server.origin)
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/blocked`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)

      await page.goto(`chrome-extension://${extensionId}/options.html`)
      await expect(page).toHaveURL(`chrome-extension://${extensionId}/options.html`)
    }
    finally {
      await server.close()
    }
  })

  test('https?://x.com.* 相当の 0 分上限で対象 URL をリダイレクトする', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      const originPattern = server.origin.replace('http', 'https?').replace('127.0.0.1', '127.0.0.1')
      await saveBlockingSettingsWithPattern(serviceWorker, server.origin, `${originPattern}.*`)
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)
    }
    finally {
      await server.close()
    }
  })

  test('blockedPage 設定では拡張ページにブロック元 URL とグループ名を表示する', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await saveBlockedPageSettings(serviceWorker, server.origin, [{ id: 'block-local', name: 'Block local' }])
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
      await expect(page.getByLabel('Blocked URL')).toHaveText(`${server.origin}/target`)
      await expect(page.getByLabel('Blocked groups')).toHaveText('Block local')
    }
    finally {
      await server.close()
    }
  })

  test('blockedPage 設定では複数のブロックグループ名を表示する', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await saveBlockedPageSettings(serviceWorker, server.origin, [
        { id: 'work', name: 'Work block' },
        { id: 'night', name: 'Night block' },
      ])
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
      await expect(page.getByLabel('Blocked groups')).toHaveText('Work block, Night block')
    }
    finally {
      await server.close()
    }
  })

  test('Options で Blocked page に切り替えた後は拡張ページへ遷移する', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await saveBlockingSettings(serviceWorker, server.origin)
      await page.goto(`chrome-extension://${extensionId}/options.html`)
      await page.getByRole('button', { name: 'Blocked page' }).click()
      await expect.poll(async () => getStoredBlockAction(serviceWorker)).toBe('blockedPage')

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
      await expect(page.getByLabel('Blocked groups')).toHaveText('Block local')
    }
    finally {
      await server.close()
    }
  })
})

test.describe('Badge display', () => {
  test('時間制限のある URL にアクセスするとバッジに残り時間を表示する', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await serviceWorker.evaluate(async (settings) => {
        const chromeApi = globalThis as unknown as {
          chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
        }
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'redirect',
            redirectUrl: `${settings.origin}/blocked`,
            dailyResetHour: '00:00',
          },
          groups: [{
            id: 'timed-group',
            name: 'Timed Group',
            mode: 'blacklist',
            patterns: [`^${settings.originEscaped}`],
            blockedTimeSlots: [],
            timeLimits: [{ daysOfWeek: [], dailyMinutes: 60 }],
          }],
        })
      }, { origin: server.origin, originEscaped: server.origin.replaceAll('.', '\\.') })
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      const tabId = await getTabIdByUrl(serviceWorker, `${server.origin}/target`)
      expect(tabId).toBeDefined()

      await expect.poll(async () => getBadgeText(serviceWorker, tabId!), { timeout: 5000 }).toBe('60m')
    }
    finally {
      await server.close()
    }
  })

  test('対象外の URL ではバッジが空になる', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await serviceWorker.evaluate(async (settings) => {
        const chromeApi = globalThis as unknown as {
          chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
        }
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'redirect',
            redirectUrl: `${settings.origin}/blocked`,
            dailyResetHour: '00:00',
          },
          groups: [{
            id: 'timed-group',
            name: 'Timed Group',
            mode: 'blacklist',
            patterns: ['example\\.com'],
            blockedTimeSlots: [],
            timeLimits: [{ daysOfWeek: [], dailyMinutes: 60 }],
          }],
        })
      }, { origin: server.origin })
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/other`)
      const tabId = await getTabIdByUrl(serviceWorker, `${server.origin}/other`)
      expect(tabId).toBeDefined()

      await page.waitForTimeout(1500)
      expect(await getBadgeText(serviceWorker, tabId!)).toBe('')
    }
    finally {
      await server.close()
    }
  })

  test('消費時間がある場合にバッジが残り時間を正しく反映する', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await serviceWorker.evaluate(async (settings) => {
        const chromeApi = globalThis as unknown as {
          chrome: {
            storage: {
              sync: { set: (items: Record<string, unknown>) => Promise<void> }
              local: { set: (items: Record<string, unknown>) => Promise<void> }
            }
          }
        }
        const today = new Date().toISOString().slice(0, 10)
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'redirect',
            redirectUrl: `${settings.origin}/blocked`,
            dailyResetHour: '00:00',
          },
          groups: [{
            id: 'timed-group',
            name: 'Timed Group',
            mode: 'blacklist',
            patterns: [`^${settings.originEscaped}`],
            blockedTimeSlots: [],
            timeLimits: [{ daysOfWeek: [], dailyMinutes: 60 }],
          }],
        })
        await chromeApi.chrome.storage.local.set({
          counters: { 'timed-group': { logicalDate: today, consumedSec: 3000 } },
        })
      }, { origin: server.origin, originEscaped: server.origin.replaceAll('.', '\\.') })
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      const tabId = await getTabIdByUrl(serviceWorker, `${server.origin}/target`)
      expect(tabId).toBeDefined()

      await expect.poll(async () => getBadgeText(serviceWorker, tabId!), { timeout: 5000 }).toBe('50m')
    }
    finally {
      await server.close()
    }
  })
})
