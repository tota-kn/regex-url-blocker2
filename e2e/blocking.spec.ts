import type { Worker } from '@playwright/test'
import { test, expect } from './fixtures'
import type { GlobalSettings, Group } from '../utils/types'

/** SW コンテキスト内で `chrome.storage.sync.set` を呼ぶ。 */
const swSyncSet = async (sw: Worker, value: Record<string, unknown>): Promise<void> => {
  await sw.evaluate(
    (v: Record<string, unknown>) =>
      (globalThis as unknown as { chrome: { storage: { sync: { set: (x: unknown) => void } } } })
        .chrome.storage.sync.set(v),
    value,
  )
}

/** SW コンテキスト内で `chrome.storage.local.set` を呼ぶ。 */
const swLocalSet = async (sw: Worker, value: Record<string, unknown>): Promise<void> => {
  await sw.evaluate(
    (v: Record<string, unknown>) =>
      (globalThis as unknown as { chrome: { storage: { local: { set: (x: unknown) => void } } } })
        .chrome.storage.local.set(v),
    value,
  )
}

test('dailyTimeLimitMinutes: 0 のグループにマッチする URL がリダイレクトされる', async ({ context }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')

  const group: Group = {
    id: 'block-test-limit',
    name: 'ブロックテスト',
    patterns: ['example\\.org'],
    dailyTimeLimitMinutes: 0,
    allowedHours: [],
  }
  const settings: GlobalSettings = { redirectUrl: 'https://example.com', dailyResetHour: '00:00' }
  await swSyncSet(sw, { groups: [group], settings })
  await swLocalSet(sw, {
    accumulators: {
      'block-test-limit': { logicalDate: new Date().toISOString().slice(0, 10), consumedSec: 0 },
    },
  })
  await sw.evaluate(() => new Promise(r => setTimeout(r, 500)))

  const page = await context.newPage()
  await page.goto('https://example.org/', { waitUntil: 'commit' }).catch(() => {})
  await expect(page).toHaveURL('https://example.com', { timeout: 10000 })
})

test('許可時間帯外のグループにマッチする URL がリダイレクトされる', async ({ context }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')

  const nowHHMM = new Date().toTimeString().slice(0, 5)
  if (nowHHMM >= '00:01' && nowHHMM < '00:02') {
    test.skip()
    return
  }

  const group: Group = {
    id: 'block-test-hours',
    name: '時間帯ブロックテスト',
    patterns: ['example\\.org'],
    dailyTimeLimitMinutes: null,
    allowedHours: [{ start: '00:01', end: '00:02' }],
  }
  const settings: GlobalSettings = { redirectUrl: 'https://example.com', dailyResetHour: '00:00' }
  await swSyncSet(sw, { groups: [group], settings })
  await sw.evaluate(() => new Promise(r => setTimeout(r, 500)))

  const page = await context.newPage()
  await page.goto('https://example.org/', { waitUntil: 'commit' }).catch(() => {})
  await expect(page).toHaveURL('https://example.com', { timeout: 10000 })
})

test('カスタム redirectUrl に遷移する', async ({ context }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')

  const group: Group = {
    id: 'block-test-redirect',
    name: 'リダイレクト先テスト',
    patterns: ['example\\.org'],
    dailyTimeLimitMinutes: 0,
    allowedHours: [],
  }
  const settings: GlobalSettings = { redirectUrl: 'https://example.com/blocked', dailyResetHour: '00:00' }
  await swSyncSet(sw, { groups: [group], settings })
  await swLocalSet(sw, {
    accumulators: {
      'block-test-redirect': { logicalDate: new Date().toISOString().slice(0, 10), consumedSec: 0 },
    },
  })
  await sw.evaluate(() => new Promise(r => setTimeout(r, 500)))

  const page = await context.newPage()
  await page.goto('https://example.org/', { waitUntil: 'commit' }).catch(() => {})
  await expect(page).toHaveURL('https://example.com/blocked', { timeout: 10000 })
})

test('複数グループにマッチするとき両方のカウンタが進む', async ({ context }) => {
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')

  const today = new Date().toISOString().slice(0, 10)
  const groups: Group[] = [
    { id: 'multi-g1', name: 'グループ1', patterns: ['example\\.org'], dailyTimeLimitMinutes: null, allowedHours: [] },
    { id: 'multi-g2', name: 'グループ2', patterns: ['example\\.org'], dailyTimeLimitMinutes: null, allowedHours: [] },
  ]
  const settings: GlobalSettings = { redirectUrl: 'https://example.com', dailyResetHour: '00:00' }
  await swSyncSet(sw, { groups, settings })
  await swLocalSet(sw, {
    accumulators: {
      'multi-g1': { logicalDate: today, consumedSec: 0 },
      'multi-g2': { logicalDate: today, consumedSec: 0 },
    },
  })
  await sw.evaluate(() => new Promise(r => setTimeout(r, 500)))

  const page = await context.newPage()
  await page.goto('https://example.org/')
  await page.bringToFront()
  await page.waitForTimeout(4000)

  const result = await sw.evaluate(() =>
    (globalThis as unknown as { chrome: { storage: { local: { get: (k: string) => Promise<Record<string, unknown>> } } } })
      .chrome.storage.local.get('accumulators'),
  ) as { accumulators: Record<string, { consumedSec: number }> }

  expect(result.accumulators['multi-g1']?.consumedSec ?? 0).toBeGreaterThan(0)
  expect(result.accumulators['multi-g2']?.consumedSec ?? 0).toBeGreaterThan(0)
})
