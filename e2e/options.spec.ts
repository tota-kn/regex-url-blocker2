import { test, expect } from './fixtures'
import type { GlobalSettings, Group } from '../utils/types'

type SyncChrome = { chrome: { storage: { sync: { set: (v: unknown) => void } } } }

test.beforeEach(async ({ context }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  await sw.evaluate(() =>
    (globalThis as unknown as SyncChrome).chrome.storage.sync.set({ groups: [] }),
  )
})

test('グループを追加して保存できる', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.waitForSelector('[data-loaded]')

  await page.getByRole('button', { name: 'グループを追加' }).click()
  await expect(page.getByPlaceholder('グループ名')).toBeVisible()

  await page.getByPlaceholder('グループ名').fill('SNS')
  await page.getByRole('button', { name: '正規表現パターンを追加' }).click()
  await page.getByLabel('正規表現パターン 1').fill('twitter\\.com')

  // debounce 待ち
  await page.waitForTimeout(500)

  // ページリロード後も保存されている
  await page.reload()
  await expect(page.getByPlaceholder('グループ名')).toHaveValue('SNS')
})

test('無効な正規表現はエラー表示されて入力が継続できる', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.waitForSelector('[data-loaded]')

  await page.getByRole('button', { name: 'グループを追加' }).click()
  await page.getByRole('button', { name: '正規表現パターンを追加' }).click()
  await page.getByLabel('正規表現パターン 1').fill('(invalid')

  await expect(page.getByTestId('pattern-error-0')).toBeVisible()
})

test('許可時間帯を追加できる', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.waitForSelector('[data-loaded]')

  await page.getByRole('button', { name: 'グループを追加' }).click()
  await page.getByRole('button', { name: '許可時間帯を追加' }).click()

  await expect(page.getByLabel('許可時間帯 1 開始')).toBeVisible()
  await expect(page.getByLabel('許可時間帯 1 終了')).toBeVisible()
})

test('グローバル設定のリダイレクト先 URL を変更できる', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  const input = page.getByLabel('リダイレクト先 URL')
  await input.fill('https://redirect.example.com')
  await page.waitForTimeout(500)

  await page.reload()
  await expect(page.getByLabel('リダイレクト先 URL')).toHaveValue('https://redirect.example.com')
})

test('グループを削除できる', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const group: Group = {
    id: 'test-delete-id',
    name: '削除テスト',
    patterns: ['example\\.com'],
    dailyTimeLimitMinutes: null,
    allowedHours: [],
  }
  await sw.evaluate(
    g => (globalThis as unknown as { chrome: { storage: { sync: { set: (v: unknown) => void } } } }).chrome.storage.sync.set({ groups: [g] }),
    group,
  )

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await expect(page.getByPlaceholder('グループ名')).toHaveValue('削除テスト')
  await page.getByRole('button', { name: 'グループを削除' }).click()
  await page.waitForTimeout(500)

  await page.reload()
  await expect(page.getByPlaceholder('グループ名')).not.toBeVisible()
})

test('リセット時刻の設定値が反映される', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const settings: GlobalSettings = { redirectUrl: 'https://example.com', dailyResetHour: '04:00' }
  await sw.evaluate(
    s => (globalThis as unknown as { chrome: { storage: { sync: { set: (v: unknown) => void } } } }).chrome.storage.sync.set({ settings: s }),
    settings,
  )

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByLabel('1日のリセット時刻')).toHaveValue('04:00')
})
