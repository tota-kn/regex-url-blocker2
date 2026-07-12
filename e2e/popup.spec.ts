import type { BrowserContext, Page, Worker } from '@playwright/test'
import { expect, test } from './fixtures'
import { startTestServer, waitForEffectiveSettings } from './helpers'

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
    const dailyRules = (override: Record<string, unknown> = {}) =>
      [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        blockedTimeRanges: [],
        dailyLimitMinutes: undefined,
        ...override,
      }))
    const now = new Date()
    const nowMinute = now.getHours() * 60 + now.getMinutes()
    const inactiveStart = (nowMinute + 60) % 1440
    const inactiveRange =
      inactiveStart + 30 <= 1440
        ? { startMinute: inactiveStart, endMinute: inactiveStart + 30 }
        : { startMinute: 0, endMinute: 30 }
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
          patterns: [`^${origin.replaceAll('.', '\\.')}/slot-active`],
          dailyRules: dailyRules({ blockedTimeRanges: [{ startMinute: 0, endMinute: 0 }] }),
        },
        {
          id: 'slot-inactive',
          name: 'Slot Inactive',
          mode: 'blacklist',
          patterns: [`^${origin.replaceAll('.', '\\.')}/slot-inactive`],
          dailyRules: dailyRules({ blockedTimeRanges: [inactiveRange] }),
        },
        {
          id: 'pause-target',
          name: 'Pause Target',
          mode: 'blacklist',
          patterns: [`^${origin.replaceAll('.', '\\.')}/pause`],
          dailyRules: dailyRules({ dailyLimitMinutes: 30 }),
        },
        {
          id: 'no-limits',
          name: 'No Limits',
          mode: 'blacklist',
          patterns: [`^${origin.replaceAll('.', '\\.')}/no-limits`],
          dailyRules: dailyRules(),
        },
        {
          id: 'disabled-match',
          name: 'Disabled Match',
          mode: 'blacklist',
          disabled: true,
          patterns: [`^${origin.replaceAll('.', '\\.')}/disabled`],
          dailyRules: dailyRules({ dailyLimitMinutes: 0 }),
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
        'slot-inactive': {
          logicalDate,
          consumedSec: 0,
        },
        'pause-target': {
          logicalDate,
          consumedSec: 0,
        },
        'no-limits': {
          logicalDate,
          consumedSec: 0,
        },
      },
    })
  }, todayId())
}

/**
 * popup テスト用の一時停止状態を storage.local に保存する。
 */
async function savePopupPauseState(
  serviceWorker: Worker,
  entry: { waitingUntil?: number; pausedUntil?: number },
): Promise<void> {
  await serviceWorker.evaluate(async (entry) => {
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
      groupPauseState: {
        'pause-target': entry,
      },
    })
  }, entry)
}

/**
 * popup テスト用の設定とカウンタを storage に保存する。
 */
async function savePopupFixture(serviceWorker: Worker, origin: string): Promise<void> {
  await savePopupSettings(serviceWorker, origin)
  await waitForEffectiveSettings(serviceWorker)
  await savePopupCounters(serviceWorker)
}

/**
 * 現在タブを用意したうえで popup.html を開く。
 */
async function openPopupPage(
  context: BrowserContext,
  page: Page,
  extensionId: string,
  url: string,
): Promise<Page> {
  await page.goto(url)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  return popup
}

test.describe('Popup 画面', () => {
  test('オプション画面を開くリンクを表示する', async ({ page, context, extensionId }) => {
    const server = await startTestServer()
    try {
      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/target`)

      const optionsPagePromise = context.waitForEvent('page')
      await popup.getByRole('button', { name: 'Open options' }).click()
      const optionsPage = await optionsPagePromise

      await expect(optionsPage).toHaveURL(`chrome-extension://${extensionId}/options.html`)
    } finally {
      await server.close()
    }
  })

  test('現在ページに一致する複数グループの残り時間をすべて表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/target`)

      await expect(popup.getByLabel('Active limits for this page')).toContainText('Limited A')
      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText(
        '5:00 left',
      )
      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText(
        '25:00 / 30:00',
      )
      await expect(popup.getByLabel('Remaining time for Limited A summary')).not.toContainText(
        'Daily limit',
      )
      await expect(
        popup.getByRole('meter', { name: 'Remaining time for Limited A' }),
      ).toHaveAttribute('aria-valuenow', String(25 * 60))
      await expect(popup.getByLabel('Active limits for this page')).toContainText('Limited B')
      await expect(popup.getByLabel('Remaining time for Limited B summary')).toContainText(
        '2:00 left',
      )
      await expect(popup.getByLabel('Remaining time for Limited B summary')).toContainText(
        '8:00 / 10:00',
      )
      await expect(
        popup.getByRole('meter', { name: 'Remaining time for Limited B' }),
      ).toHaveAttribute('aria-valuenow', String(8 * 60))
    } finally {
      await server.close()
    }
  })

  test('カウンタ更新時に残り時間を更新する', async ({ page, context, extensionId }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)
      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/target`)

      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText(
        '5:00 left',
      )
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

      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText(
        '2:00 left',
      )
      await expect(popup.getByLabel('Remaining time for Limited A summary')).toContainText(
        '28:00 / 30:00',
      )
    } finally {
      await server.close()
    }
  })

  test('一致グループがない場合は空状態を表示する', async ({ page, context, extensionId }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/other`)

      await expect(popup.getByText('No matching groups for this page.')).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('今日の時間帯ルールも閲覧上限も一時停止状態もない場合は空状態を表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/no-limits`)

      await expect(popup.getByText('No active limits apply to this page.')).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('時間帯ルールが現在時間外でもグループ状態を表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)

      const popup = await openPopupPage(
        context,
        page,
        extensionId,
        `${server.origin}/slot-inactive`,
      )

      await expect(popup.getByLabel('Active limits for this page')).toContainText('Slot Inactive')
      await expect(popup.getByText('Blocked hours scheduled')).toBeVisible()
      await expect(popup.getByText('No active limits apply to this page.')).toBeHidden()
    } finally {
      await server.close()
    }
  })

  test('一時停止中のグループ状態を表示する', async ({ page, context, extensionId }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)
      await savePopupPauseState(serviceWorker, { pausedUntil: Date.now() + 125_000 })

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/pause`)

      await expect(popup.getByText(/Paused 2:0[0-5]/)).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('一時停止リクエスト待機中の残り時間を表示する', async ({ page, context, extensionId }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)
      await savePopupPauseState(serviceWorker, { waitingUntil: Date.now() + 65_000 })

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/pause`)

      await expect(popup.getByText(/Pause 1:0[0-5] left/)).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('一時停止リクエスト待機完了後に ready 表示へ切り替える', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)
      await savePopupPauseState(serviceWorker, { waitingUntil: Date.now() + 1_000 })

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/pause`)

      await expect(popup.getByText('Pause ready')).toBeVisible({ timeout: 4_000 })
    } finally {
      await server.close()
    }
  })

  test('disabled group だけが一致する URL は一致なしとして表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await savePopupFixture(serviceWorker, server.origin)

      const popup = await openPopupPage(context, page, extensionId, `${server.origin}/disabled`)

      await expect(popup.getByText('No matching groups for this page.')).toBeVisible()
    } finally {
      await server.close()
    }
  })
})
