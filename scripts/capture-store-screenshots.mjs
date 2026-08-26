import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extensionPath = path.join(root, '.output/chrome-mv3')
const screenshotsRoot = path.join(root, 'docs/store-assets/screenshots')

const localeCopy = {
  en: {
    edit: 'Edit',
    general: /General settings/,
    groups: ['Social and video', 'Workday focus'],
    name: 'Name',
  },
  ja: {
    edit: '編集',
    general: /一般設定/,
    groups: ['SNS・動画', '仕事中の集中'],
    name: '名前',
  },
}

/** 現在時刻に対応するルール日の識別子を返す。 */
function logicalDateId(now = new Date()) {
  const date = new Date(now)
  if (date.getHours() < 3) date.setDate(date.getDate() - 1)
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-')
}

/** ストア画像に使う固定サンプル設定を生成する。 */
function buildSettings(locale, theme = 'light') {
  const [socialName, workName] = localeCopy[locale].groups
  return {
    global: {
      language: locale,
      theme,
      dailyResetHour: '03:00',
      remainingTimeNotificationsEnabled: true,
      notificationThresholdMinutes: 5,
    },
    groups: [
      {
        id: 'store-social',
        name: socialName,
        disabled: false,
        lockMode: true,
        patterns: ['youtube.com', 'instagram.com', '^https://x\\.com/'],
        pauseWaitSeconds: 30,
        pauseDurationMinutes: 10,
        pauseAllowed: true,
        rules: [
          {
            id: 'store-daily',
            window: { type: 'always' },
            restriction: { kind: 'dailyLimit', minutes: 30 },
            destination: { type: 'blockedPage' },
          },
          {
            id: 'store-wait',
            window: { type: 'always' },
            restriction: { kind: 'wait', seconds: 15, grantMinutes: 10 },
          },
        ],
      },
      {
        id: 'store-work',
        name: workName,
        disabled: false,
        lockMode: false,
        patterns: ['reddit.com', 'news.ycombinator.com'],
        pauseWaitSeconds: 60,
        pauseDurationMinutes: 10,
        pauseAllowed: false,
        rules: [
          {
            id: 'store-block',
            window: {
              type: 'scheduled',
              condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
              timeRanges: [{ startMinute: 540, endMinute: 1080 }],
            },
            restriction: { kind: 'block' },
            destination: { type: 'blockedPage' },
          },
        ],
      },
    ],
  }
}

/** Service Worker経由でスクリーンショット用の設定と状態を保存する。 */
async function seedStorage(serviceWorker, settings) {
  await serviceWorker.evaluate(
    async ({ settings, logicalDate }) => {
      await globalThis.chrome.storage.sync.clear()
      await globalThis.chrome.storage.local.clear()
      await globalThis.chrome.storage.sync.set({
        global: settings.global,
        groups: settings.groups,
      })
      await globalThis.chrome.storage.local.set({
        effectiveSettings: settings,
        effectiveSettingsLogicalDate: logicalDate,
        counters: {
          'store-social': { logicalDate, consumedSec: 12 * 60 },
          'store-work': { logicalDate, consumedSec: 0 },
        },
        delayGrantState: {
          'store-social': { grantedUntil: Date.now() + 10 * 60 * 1000 },
        },
      })
    },
    { settings, logicalDate: logicalDateId() },
  )
}

/** 指定ページを1280×800のPNGとして保存する。 */
async function capture(page, outputDirectory, filename) {
  await page.screenshot({
    path: path.join(outputDirectory, filename),
    animations: 'disabled',
  })
}

/** 1ロケール分のストア画像5枚を生成する。 */
async function captureLocale(context, serviceWorker, extensionId, locale, targetUrl) {
  const outputDirectory = path.join(screenshotsRoot, locale)
  await mkdir(outputDirectory, { recursive: true })

  const lightSettings = buildSettings(locale)
  await seedStorage(serviceWorker, lightSettings)

  const optionsPage = await context.newPage()
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`)
  await optionsPage.getByRole('textbox', { name: localeCopy[locale].name }).first().waitFor()
  await capture(optionsPage, outputDirectory, '01-options-groups.png')

  await serviceWorker.evaluate(async () => {
    const { global } = await globalThis.chrome.storage.sync.get('global')
    await globalThis.chrome.storage.sync.set({ global: { ...global, theme: 'dark' } })
  })
  await optionsPage.getByRole('button', { name: localeCopy[locale].edit }).first().click()
  await optionsPage.locator('html[data-theme="dark"]').waitFor()
  await capture(optionsPage, outputDirectory, '02-group-editor-dark.png')

  await serviceWorker.evaluate(async () => {
    const { global } = await globalThis.chrome.storage.sync.get('global')
    await globalThis.chrome.storage.sync.set({ global: { ...global, theme: 'light' } })
  })
  await optionsPage.getByRole('button', { name: localeCopy[locale].general }).click()
  await optionsPage.locator('html[data-theme="light"]').waitFor()
  await capture(optionsPage, outputDirectory, '03-general-settings.png')

  const popupSettings = buildSettings(locale)
  popupSettings.groups[0].patterns = ['127.0.0.1']
  popupSettings.groups[0].rules = [popupSettings.groups[0].rules[0]]
  await seedStorage(serviceWorker, popupSettings)
  const targetPage = await context.newPage()
  await targetPage.goto(targetUrl)
  const popupPage = await context.newPage()
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)
  await popupPage.waitForTimeout(500)
  await capture(popupPage, outputDirectory, '04-popup-remaining-time.png')

  const blockedSettings = buildSettings(locale)
  blockedSettings.groups[0].rules = [
    {
      id: 'store-blocked',
      window: { type: 'always' },
      restriction: { kind: 'block' },
      destination: { type: 'blockedPage' },
    },
  ]
  await seedStorage(serviceWorker, blockedSettings)
  const blockedPage = await context.newPage()
  const query = new URLSearchParams({
    url: 'https://www.youtube.com/watch?v=focus-demo',
    group: 'store-social',
  })
  await blockedPage.goto(`chrome-extension://${extensionId}/blocked.html?${query}`)
  await blockedPage.getByText(localeCopy[locale].groups[0]).waitFor()
  await capture(blockedPage, outputDirectory, '05-blocked-page.png')
}

/** ローカルの判定対象ページを提供するHTTPサーバーを起動する。 */
async function startTargetServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>Focus demo</title><main>Focus demo</main>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to start target server')
  return {
    server,
    url: `http://127.0.0.1:${address.port}/youtube.com`,
  }
}

/** 拡張機能を読み込み、英語・日本語のストア画像を生成する。 */
async function main() {
  const { server, url } = await startTargetServer()
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    args: [
      '--disable-crash-reporter',
      '--disable-crashpad',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })

  try {
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker')
    const extensionId = serviceWorker.url().split('/')[2]
    for (const locale of ['en', 'ja']) {
      await captureLocale(context, serviceWorker, extensionId, locale, url)
    }
  } finally {
    await context.close()
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
}

await main()
