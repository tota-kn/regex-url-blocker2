import { createServer, type Server } from 'node:http'
import type { BrowserContext, Page, Worker } from '@playwright/test'
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
 * 今日の論理日 ID を返す。
 */
function todayId(): string {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Service Worker 上の storage.sync に popup テスト用設定を書き込む。
 */
async function savePopupSettings(serviceWorker: Worker, origin: string): Promise<void> {
  await serviceWorker.evaluate(async (origin) => {
    const chromeApi = globalThis as unknown as {
      chrome: {
        storage: {
          sync: {
            set: (items: Record<string, unknown>) => Promise<void>
          }
        }
      }
    }
    const dailyRules = (override: Record<string, unknown> = {}) => [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
      dayOfWeek,
      blockedTimeRanges: [],
      dailyLimitMinutes: undefined,
      ...override,
    }))
    await chromeApi.chrome.storage.sync.set({
      global: {
        blockAction: 'redirect',
        redirectUrl: 'https://example.com/blocked',
        dailyResetHour: '00:00',
      },
      groups: [
        {
          id: 'limited-a',
          name: 'Limited A',
          mode: 'blacklist',
          patterns: [`^${origin.replaceAll('.', '\\.')}/target`],
          dailyRules: dailyRules({ dailyLimitMinutes: 30 }),
        },
        {
          id: 'limited-b',
          name: 'Limited B',
          mode: 'blacklist',
          patterns: [`^${origin.replaceAll('.', '\\.')}/target`],
          dailyRules: dailyRules({ dailyLimitMinutes: 10 }),
        },
        {
          id: 'slot-only',
          name: 'Slot Only',
          mode: 'blacklist',
          patterns: [`^${origin.replaceAll('.', '\\.')}/slot-only`],
          dailyRules: dailyRules(),
        },
      ],
    })
  }, origin)
}

/**
 * Service Worker 上の storage.local に popup テスト用カウンタを書き込む。
 */
async function savePopupCounters(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async (logicalDate) => {
    const chromeApi = globalThis as unknown as {
      chrome: {
        storage: {
          local: {
            set: (items: Record<string, unknown>) => Promise<void>
          }
        }
      }
    }
    await chromeApi.chrome.storage.local.set({
      counters: {
        'limited-a': {
          logicalDate,
          consumedSec: 25 * 60,
        },
        'limited-b': {
          logicalDate,
          consumedSec: 8 * 60,
        },
        'slot-only': {
          logicalDate,
          consumedSec: 0,
        },
      },
    })
  }, todayId())
}

/**
 * popup テスト用の設定とカウンタを storage に保存する。
 */
async function savePopupFixture(serviceWorker: Worker, origin: string): Promise<void> {
  await savePopupSettings(serviceWorker, origin)
  await new Promise(resolve => setTimeout(resolve, 300))
  await savePopupCounters(serviceWorker)
}

/**
 * 現在タブを用意したうえで popup.html を開く。
 */
async function openPopupPage(context: BrowserContext, page: Page, extensionId: string, url: string): Promise<Page> {
  await page.goto(url)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  return popup
}

test.describe('Popup 画面', () => {
  test('オプション画面を開くリンクを表示する', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/target`)

      const optionsPagePromise = context.waitForEvent('page')
      await popup.getByRole('button', { name: 'Open options' }).click()
      const optionsPage = await optionsPagePromise

      await expect(optionsPage).toHaveURL(`chrome-extension://${extensionId}/options.html`)
    }
    finally {
      await server.close()
    }
  })

  test('現在ページに一致する複数グループの残り時間をすべて表示する', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await savePopupFixture(serviceWorker, server.origin)

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/target`)

      await expect(popup.getByLabel('Remaining time for this page')).toContainText('Limited A')
      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText('5:00 left')
      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText('25:00 / 30:00')
      await expect(popup.getByLabel('Remaining time for Limited A summary')).not.toContainText('Daily limit')
      await expect(popup.getByRole('meter', { name: 'Remaining time for Limited A' })).toHaveAttribute('aria-valuenow', String(25 * 60))
      await expect(popup.getByLabel('Remaining time for this page')).toContainText('Limited B')
      await expect(popup.getByLabel('Remaining time for Limited B summary')).toContainText('2:00 left')
      await expect(popup.getByLabel('Remaining time for Limited B summary')).toContainText('8:00 / 10:00')
      await expect(popup.getByRole('meter', { name: 'Remaining time for Limited B' })).toHaveAttribute('aria-valuenow', String(8 * 60))
    }
    finally {
      await server.close()
    }
  })

  test('カウンタ更新時に残り時間を更新する', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await savePopupFixture(serviceWorker, server.origin)
      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/target`)

      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText('5:00 left')
      await expect(popup.getByText(/4:5[7-9] left/)).toBeVisible({ timeout: 5_000 })
      await popup.evaluate(async (logicalDate) => {
        const chromeApi = globalThis as unknown as {
          chrome: {
            storage: {
              local: {
                set: (items: Record<string, unknown>) => Promise<void>
              }
            }
          }
        }
        await chromeApi.chrome.storage.local.set({
          counters: {
            'limited-a': {
              logicalDate,
              consumedSec: 28 * 60,
            },
            'limited-b': {
              logicalDate,
              consumedSec: 8 * 60,
            },
          },
        })
      }, todayId())

      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText('2:00 left')
      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText('28:00 / 30:00')
    }
    finally {
      await server.close()
    }
  })

  test('一致グループがない場合は空状態を表示する', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await savePopupFixture(serviceWorker, server.origin)

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/other`)

      await expect(popup.getByText('No matching groups for this page.')).toBeVisible()
    }
    finally {
      await server.close()
    }
  })

  test('今日有効な閲覧上限がない場合は空状態を表示する', async ({ page, context, extensionId }) => {
    const server = await startServer()
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      await savePopupFixture(serviceWorker, server.origin)

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/slot-only`)

      await expect(popup.getByText('No daily limits apply to this page.')).toBeVisible()
    }
    finally {
      await server.close()
    }
  })
})
