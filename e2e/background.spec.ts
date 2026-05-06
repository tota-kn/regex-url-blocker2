import { createServer, type Server } from 'node:http'
import type { Page, Worker } from '@playwright/test'
import { expect, test } from './fixtures'

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
})
