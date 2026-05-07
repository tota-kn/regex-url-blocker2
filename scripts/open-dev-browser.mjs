import { chromium } from '@playwright/test'
import { existsSync } from 'fs'
import path from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pathToExtension = path.resolve(__dirname, '../.output/chrome-mv3')
const userDataDir = path.resolve(__dirname, '../.dev-browser-profile')

const manifestPath = path.join(pathToExtension, 'manifest.json')
if (!existsSync(manifestPath)) {
  process.stdout.write('WXT のビルド完了を待っています')
  while (!existsSync(manifestPath)) {
    process.stdout.write('.')
    await sleep(500)
  }
  console.log(' 完了')
}

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${pathToExtension}`,
    `--load-extension=${pathToExtension}`,
  ],
})

const [background] = context.serviceWorkers()
const sw = background ?? await context.waitForEvent('serviceworker')
const extensionId = sw.url().split('/')[2]

console.log(`Extension ID: ${extensionId}`)
console.log(`Options: chrome-extension://${extensionId}/options.html`)

const page = await context.newPage()
await page.goto(`chrome-extension://${extensionId}/options.html`)
console.log('ブラウザを閉じるとスクリプトが終了します。空白の場合はページを再読み込みしてください。')

await context.waitForEvent('close', { timeout: 0 })
