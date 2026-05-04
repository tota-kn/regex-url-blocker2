import { test, expect } from './fixtures'
import type { Group } from '../utils/types'

/** SW 経由で storage を操作するためのヘルパー型 */
type SwChrome = { chrome: { storage: { sync: { set: (v: unknown) => void }, local: { set: (v: unknown) => void } } } }

test('グループが未登録のとき未登録メッセージが表示される', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  await sw.evaluate(() => (globalThis as unknown as SwChrome).chrome.storage.sync.set({ groups: [] }))

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByText('グループが未登録です')).toBeVisible()
})

test('グループ名と消費時間が表示される', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const group: Group = {
    id: 'popup-test-1',
    name: 'SNS',
    patterns: ['twitter\\.com'],
    dailyTimeLimitMinutes: 30,
    allowedHours: [],
  }
  await sw.evaluate(
    g => (globalThis as unknown as SwChrome).chrome.storage.sync.set({ groups: [g] }),
    group,
  )
  await sw.evaluate(
    id => (globalThis as unknown as SwChrome).chrome.storage.local.set({
      accumulators: { [id]: { logicalDate: new Date().toISOString().slice(0, 10), consumedSec: 600 } },
    }),
    group.id,
  )

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  await expect(page.getByText('SNS')).toBeVisible()
  // 600秒 = 10:00 / 30:00
  await expect(page.getByText('10:00 / 30:00')).toBeVisible()
})

test('許可時間帯内は「許可中」バッジが表示される', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const group: Group = {
    id: 'popup-test-hours',
    name: '時間帯テスト',
    patterns: ['example\\.com'],
    dailyTimeLimitMinutes: null,
    allowedHours: [{ start: '00:00', end: '23:59' }],
  }
  await sw.evaluate(
    g => (globalThis as unknown as SwChrome).chrome.storage.sync.set({ groups: [g] }),
    group,
  )

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByText('許可中')).toBeVisible()
})

test('「設定を開く」リンクが存在する', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByRole('link', { name: '設定を開く' })).toBeVisible()
})

test('次のリセットまでのカウントダウンが表示される', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByText(/次のリセットまで/)).toBeVisible()
})
