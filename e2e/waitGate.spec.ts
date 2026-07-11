import { createServer, type Server } from 'node:http'
import type { Page, Worker } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * テスト用 HTTP サーバーを起動する。
 */
async function startServer(): Promise<{ origin: string, close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
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
 * redirect で中断されうる navigation を実行する。
 */
async function gotoPossiblyRedirected(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url)
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('net::ERR_ABORTED')) return
    if (error instanceof Error && error.message.includes('is interrupted by another navigation')) return
    throw error
  }
}

/**
 * Service Worker 上の storage.sync に待機ゲート設定を書き込む。
 */
async function saveWaitGateSettings(serviceWorker: Worker, origin: string, delaySeconds: number): Promise<void> {
  await serviceWorker.evaluate(async (settings) => {
    const chromeApi = globalThis as unknown as {
      chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
    }
    await chromeApi.chrome.storage.sync.set({
      global: {
        blockAction: 'blockedPage',
        redirectUrl: `${settings.origin}/redirect`,
        dailyResetHour: '00:00',
      },
      groups: [{
        id: 'wait-local',
        name: 'Wait local',
        mode: 'blacklist',
        disabled: false,
        lockMode: false,
        patterns: [`^${settings.origin.replaceAll('.', '\\.')}`],
        blockAction: 'blockedPage',
        redirectUrl: `${settings.origin}/redirect`,
        restriction: {
          condition: { type: 'daily' },
          timeRanges: [],
          type: 'wait',
          waitSeconds: settings.delaySeconds,
        },
      }],
    })
  }, { origin, delaySeconds })
}

test.describe('Wait gate', () => {
  test('待機ゲート対象ページは wait.html へ遷移し、待機完了後に許可される', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await saveWaitGateSettings(serviceWorker, server.origin, 1)
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/wait\\.html`))
      await expect(page.getByLabel('Remaining seconds')).toBeVisible()

      const continueButton = page.getByRole('button', { name: 'Continue' })
      await expect(continueButton).toBeDisabled()
      await expect(continueButton).toBeEnabled({ timeout: 5000 })

      await continueButton.click()
      await expect(page).toHaveURL(`${server.origin}/target`)

      // 許可枠内では再度待機ページへ飛ばされない
      await page.waitForTimeout(500)
      await expect(page).toHaveURL(`${server.origin}/target`)
    }
    finally {
      await server.close()
    }
  })

  test('ブラウザバックで待機を回避しても再訪時は再び待機ページになる', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await saveWaitGateSettings(serviceWorker, server.origin, 30)
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/wait\\.html`))

      // カウントダウン未完了の Continue は無効なまま
      await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()

      // 直接遷移し直しても待機ページへ戻される
      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/wait\\.html`))
    }
    finally {
      await server.close()
    }
  })
})
