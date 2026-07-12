import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 拡張機能をロードした永続コンテキストと、その拡張機能IDを提供するフィクスチャ。
 */
export const test = base.extend<{
  context: BrowserContext
  serviceWorker: Worker
  extensionId: string
}>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures require object destructuring.
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '../.output/chrome-mv3')
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        '--disable-crash-reporter',
        '--disable-crashpad',
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })
    await use(context)
    await context.close()
  },
  serviceWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker')
    }
    await use(serviceWorker)
  },
  extensionId: async ({ serviceWorker }, use) => {
    const extensionId = serviceWorker.url().split('/')[2]
    await use(extensionId)
  },
})

export const expect = test.expect
