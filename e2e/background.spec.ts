import { createServer } from 'node:http'
import type { Worker } from '@playwright/test'
import type { HHMM, RestrictionRule, Settings, TimeRange, UsageCounter } from '../utils/types'
import { expect, test } from './fixtures'
import { closeServer, gotoPossiblyRedirected } from './helpers'

/**
 * Service Worker 経由で指定タブのアクション badge テキストを取得する。
 */
async function getBadgeText(serviceWorker: Worker, tabId: number): Promise<string> {
  return serviceWorker.evaluate(async (id) => {
    const chrome = (
      globalThis as unknown as {
        chrome: { action: { getBadgeText: (d: { tabId: number }) => Promise<string> } }
      }
    ).chrome
    return chrome.action.getBadgeText({ tabId: id })
  }, tabId)
}

/**
 * Service Worker 経由で現在表示中の Chrome 通知一覧を取得する。
 */
async function getNotifications(serviceWorker: Worker): Promise<Record<string, unknown>> {
  return serviceWorker.evaluate(async () => {
    const chrome = (
      globalThis as unknown as {
        chrome: { notifications: { getAll: () => Promise<Record<string, unknown>> } }
      }
    ).chrome
    return chrome.notifications.getAll()
  })
}

/**
 * Service Worker 経由で現在表示中の Chrome 通知を消去する。
 */
async function clearNotifications(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const chrome = (
      globalThis as unknown as {
        chrome: {
          notifications: {
            clear: (notificationId: string) => Promise<boolean>
            getAll: () => Promise<Record<string, unknown>>
          }
        }
      }
    ).chrome
    const notifications = await chrome.notifications.getAll()
    await Promise.all(Object.keys(notifications).map((id) => chrome.notifications.clear(id)))
  })
}

/**
 * Service Worker 経由で指定 URL を持つタブの ID を取得する。
 */
async function getTabIdByUrl(serviceWorker: Worker, url: string): Promise<number | undefined> {
  return serviceWorker.evaluate(async (targetUrl) => {
    const chrome = (
      globalThis as unknown as {
        chrome: { tabs: { query: (q: object) => Promise<Array<{ id?: number }>> } }
      }
    ).chrome
    const tabs = await chrome.tabs.query({ url: targetUrl })
    return tabs[0]?.id
  }, url)
}

/**
 * テスト用 HTTP サーバーを起動する。
 */
async function startServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (req.url === '/spa') {
      res.end(
        '<!doctype html><button id="go">go</button><script>document.getElementById("go").onclick = () => history.pushState({}, "", "/target")</script>',
      )
      return
    }
    res.end(`<!doctype html><title>${req.url}</title><main>${req.url}</main>`)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
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
 * Service Worker 上の storage.sync に即ブロック設定を書き込む。
 */
async function saveBlockingSettings(serviceWorker: Worker, origin: string): Promise<void> {
  await saveBlockingSettingsWithPattern(serviceWorker, origin, `^${origin.replaceAll('.', '\\.')}`)
}

/**
 * Service Worker 上の storage.sync に指定 pattern の即ブロック設定を書き込む。
 */
async function saveBlockingSettingsWithPattern(
  serviceWorker: Worker,
  origin: string,
  pattern: string,
): Promise<void> {
  await serviceWorker.evaluate(
    async (settings) => {
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
          blockAction: 'redirect',
          redirectUrl: `${settings.origin}/blocked`,
          dailyResetHour: '00:00',
        },
        groups: [
          {
            id: 'block-local',
            name: 'Block local',
            mode: 'blacklist',
            patterns: [settings.pattern],
            blockAction: 'redirect',
            redirectUrl: `${settings.origin}/blocked`,
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 0,
            })),
          },
        ],
      })
    },
    { origin, pattern },
  )
}

/**
 * Service Worker 上の storage.sync に拡張ページ表示用の即ブロック設定を書き込む。
 */
async function saveBlockedPageSettings(
  serviceWorker: Worker,
  origin: string,
  groups: Array<{ id: string; name: string }>,
): Promise<void> {
  await serviceWorker.evaluate(
    async (settings) => {
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
          blockAction: 'blockedPage',
          redirectUrl: `${settings.origin}/blocked`,
          dailyResetHour: '00:00',
        },
        groups: settings.groups.map((group) => ({
          id: group.id,
          name: group.name,
          mode: 'blacklist',
          patterns: [`^${settings.origin.replaceAll('.', '\\.')}`],
          blockAction: 'blockedPage',
          redirectUrl: `${settings.origin}/blocked`,
          dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: 0,
          })),
        })),
      })
    },
    { origin, groups },
  )
}

/**
 * Service Worker 上に理由表示を検証する blockedPage 設定を書き込む。
 */
async function saveBlockedPageDetailSettings(
  serviceWorker: Worker,
  origin: string,
  dailyResetHour: HHMM,
  groups: Array<{
    id: string
    name: string
    blockedTimeRanges: TimeRange[]
    dailyLimitMinutes?: number
    counter?: UsageCounter
  }>,
): Promise<void> {
  await serviceWorker.evaluate(
    async (settings) => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: { set: (items: Record<string, unknown>) => Promise<void> }
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'blockedPage',
          redirectUrl: `${settings.origin}/blocked`,
          dailyResetHour: settings.dailyResetHour,
        },
        groups: settings.groups.map((group) => ({
          id: group.id,
          name: group.name,
          mode: 'blacklist',
          patterns: [`^${settings.origin.replaceAll('.', '\\.')}`],
          blockAction: 'blockedPage',
          redirectUrl: `${settings.origin}/blocked`,
          dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            blockedTimeRanges: group.blockedTimeRanges,
            dailyLimitMinutes: group.dailyLimitMinutes,
          })),
        })),
      })
      await chromeApi.chrome.storage.local.set({
        counters: Object.fromEntries(
          settings.groups
            .filter((group) => group.counter)
            .map((group) => [group.id, group.counter]),
        ),
      })
    },
    { origin, dailyResetHour, groups },
  )
}

/**
 * 毎日同じ上限分数を使うテスト用の単一 grace 制限を作る。undefined は制限なし。
 */
function buildRestriction(dailyLimitMinutes: number | undefined): RestrictionRule | undefined {
  if (dailyLimitMinutes === undefined) return undefined
  return {
    condition: { type: 'daily' },
    timeRanges: [],
    type: 'grace',
    graceMinutes: dailyLimitMinutes,
  }
}

/**
 * 次のリセットまで十分な猶予があるテスト用 dailyResetHour を返す。
 */
function buildStableDailyResetHour(now: Date): HHMM {
  const resetMinute = (now.getHours() * 60 + now.getMinutes() + 1439) % 1440
  const hour = Math.floor(resetMinute / 60)
  const minute = resetMinute % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 指定リセット時刻における現在の論理日 ID を返す。
 */
function buildLogicalDate(now: Date, dailyResetHour: HHMM): string {
  const [hour = '0', minute = '0'] = dailyResetHour.split(':')
  const reset = new Date(now)
  reset.setHours(Number(hour), Number(minute), 0, 0)
  if (now.getTime() < reset.getTime()) reset.setDate(reset.getDate() - 1)
  return [
    reset.getFullYear(),
    String(reset.getMonth() + 1).padStart(2, '0'),
    String(reset.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * 分を "HH:MM" 表示に変換する。
 */
function formatMinute(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

/**
 * 現在時刻を含み、近い将来に終わるテスト用時間帯を作る。
 */
function buildActiveTimeRange(now: Date): TimeRange {
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  return {
    startMinute: (nowMinute + 1439) % 1440,
    endMinute: (nowMinute + 60) % 1440,
  }
}

/**
 * background E2E 用の設定オブジェクトを作る。
 */
function buildEffectiveSettingsFixture(
  origin: string,
  dailyResetHour: HHMM,
  dailyLimitMinutes: number | undefined,
  lockMode = false,
  disabled = false,
): Settings {
  return {
    global: {
      blockAction: 'redirect',
      redirectUrl: `${origin}/blocked`,
      dailyResetHour,
      remainingTimeNotificationsEnabled: true,
      notificationThresholdMinutes: 5,
    },
    groups: [
      {
        id: 'effective-group',
        name: 'Effective group',
        mode: 'blacklist',
        disabled,
        lockMode,
        patterns: [`^${origin.replaceAll('.', '\\.')}`],
        blockAction: 'redirect',
        redirectUrl: `${origin}/blocked`,
        restriction: buildRestriction(dailyLimitMinutes),
      },
    ],
  }
}

/**
 * Service Worker 上で希望設定と有効設定を同時に保存する。
 */
async function savePreferredAndEffectiveSettings(
  serviceWorker: Worker,
  preferred: Settings,
  effective: Settings,
  effectiveSettingsLogicalDate: string,
): Promise<void> {
  await serviceWorker.evaluate(
    async (state) => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: { set: (items: Record<string, unknown>) => Promise<void> }
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
          }
        }
      }
      await chromeApi.chrome.storage.local.set({
        effectiveSettings: state.effective,
        effectiveSettingsLogicalDate: state.effectiveSettingsLogicalDate,
      })
      await chromeApi.chrome.storage.sync.set({
        global: state.preferred.global,
        groups: state.preferred.groups,
      })
    },
    { preferred, effective, effectiveSettingsLogicalDate },
  )
}

/**
 * Service Worker 上で希望設定だけを保存する。
 */
async function savePreferredSettings(serviceWorker: Worker, preferred: Settings): Promise<void> {
  await serviceWorker.evaluate(async (settings) => {
    const chromeApi = globalThis as unknown as {
      chrome: {
        storage: {
          sync: { set: (items: Record<string, unknown>) => Promise<void> }
        }
      }
    }
    await chromeApi.chrome.storage.sync.set({
      global: settings.global,
      groups: settings.groups,
    })
  }, preferred)
}

test.describe('Background blocking', () => {
  test('該当 URL への新規ナビゲーションを redirectUrl に書き換える', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await saveBlockingSettings(serviceWorker, server.origin)
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })

  test('redirectUrl 自体と extension URL はリダイレクトしない', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await saveBlockingSettings(serviceWorker, server.origin)
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/blocked`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)

      await page.goto(`chrome-extension://${extensionId}/options.html`)
      await expect(page).toHaveURL(`chrome-extension://${extensionId}/options.html`)
    } finally {
      await server.close()
    }
  })

  test('blockedPage 設定では複数のブロックグループ名を表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await saveBlockedPageSettings(serviceWorker, server.origin, [
        { id: 'work', name: 'Work block' },
        { id: 'night', name: 'Night block' },
      ])
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
      await expect(page.getByLabel('Blocked URL')).toHaveText(`${server.origin}/target`)
      await expect(page.getByText('Blocking groups')).not.toBeVisible()
      await expect(page.getByRole('heading', { name: 'Work block' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Night block' })).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('blockedPage 設定では時間帯ブロック理由と解除時刻を表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const range = buildActiveTimeRange(now)
      await saveBlockedPageDetailSettings(serviceWorker, server.origin, '00:00', [
        {
          id: 'focus-hours',
          name: 'Focus hours',
          blockedTimeRanges: [range],
        },
      ])
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
      const reason = page.getByLabel('Focus hours Blocked hours active')
      await expect(reason).toContainText('Blocked hours active')
      await expect(reason).toContainText(
        `${formatMinute(range.startMinute)}-${formatMinute(range.endMinute)}`,
      )
      await expect(reason).toContainText('Unblocks at')
    } finally {
      await server.close()
    }
  })

  test('blockedPage 設定では daily limit 理由と次回リセット時刻を表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      await saveBlockedPageDetailSettings(serviceWorker, server.origin, dailyResetHour, [
        {
          id: 'daily-cap',
          name: 'Daily cap',
          blockedTimeRanges: [],
          dailyLimitMinutes: 15,
          counter: {
            logicalDate: buildLogicalDate(now, dailyResetHour),
            consumedSec: 15 * 60,
          },
        },
      ])
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
      const reason = page.getByLabel('Daily cap Daily limit reached')
      await expect(reason).toContainText('Daily limit reached')
      await expect(reason).toContainText('15 min/day')
      await expect(reason).toContainText('Resets at')
    } finally {
      await server.close()
    }
  })

  test('blockedPage 設定では複数グループと複数理由を表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const range = buildActiveTimeRange(now)
      await saveBlockedPageDetailSettings(serviceWorker, server.origin, dailyResetHour, [
        {
          id: 'work',
          name: 'Work block',
          blockedTimeRanges: [range],
        },
        {
          id: 'limited',
          name: 'Limited block',
          blockedTimeRanges: [],
          dailyLimitMinutes: 5,
          counter: {
            logicalDate: buildLogicalDate(now, dailyResetHour),
            consumedSec: 5 * 60,
          },
        },
      ])
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
      await expect(page.getByText('Blocking groups')).not.toBeVisible()
      await expect(page.getByRole('heading', { name: 'Work block' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Limited block' })).toBeVisible()
      await expect(page.getByLabel('Work block Blocked hours active')).toContainText(
        'Blocked hours active',
      )
      await expect(page.getByLabel('Limited block Daily limit reached')).toContainText(
        'Daily limit reached',
      )
    } finally {
      await server.close()
    }
  })

  test('複数グループ同時ブロックでは表示順が上の blockedPage 設定を優先する', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await serviceWorker.evaluate(async (origin) => {
        const chromeApi = globalThis as unknown as {
          chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
        }
        const dailyRules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          blockedTimeRanges: [],
          dailyLimitMinutes: 0,
        }))
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'redirect',
            redirectUrl: `${origin}/legacy-blocked`,
            dailyResetHour: '00:00',
          },
          groups: [
            {
              id: 'first',
              name: 'First',
              mode: 'blacklist',
              patterns: [`^${origin.replaceAll('.', '\\.')}`],
              blockAction: 'blockedPage',
              redirectUrl: `${origin}/first-blocked`,
              dailyRules,
            },
            {
              id: 'second',
              name: 'Second',
              mode: 'blacklist',
              patterns: [`^${origin.replaceAll('.', '\\.')}`],
              blockAction: 'redirect',
              redirectUrl: `${origin}/second-blocked`,
              dailyRules,
            },
          ],
        })
      }, server.origin)
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`))
      await expect(page.getByText('Blocking groups')).not.toBeVisible()
      await expect(page.getByRole('heading', { name: 'First' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Second' })).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('複数グループ同時ブロックでは表示順が上の redirect URL を優先する', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await serviceWorker.evaluate(async (origin) => {
        const chromeApi = globalThis as unknown as {
          chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
        }
        const dailyRules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          blockedTimeRanges: [],
          dailyLimitMinutes: 0,
        }))
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'blockedPage',
            redirectUrl: `${origin}/legacy-blocked`,
            dailyResetHour: '00:00',
          },
          groups: [
            {
              id: 'first',
              name: 'First',
              mode: 'blacklist',
              patterns: [`^${origin.replaceAll('.', '\\.')}`],
              blockAction: 'redirect',
              redirectUrl: `${origin}/first-blocked`,
              dailyRules,
            },
            {
              id: 'second',
              name: 'Second',
              mode: 'blacklist',
              patterns: [`^${origin.replaceAll('.', '\\.')}`],
              blockAction: 'blockedPage',
              redirectUrl: `${origin}/second-blocked`,
              dailyRules,
            },
          ],
        })
      }, server.origin)
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/first-blocked`)
    } finally {
      await server.close()
    }
  })

  test('一時停止中のグループだけがブロック理由なら対象 URL へ遷移できる', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await serviceWorker.evaluate(async (origin) => {
        const chromeApi = globalThis as unknown as {
          chrome: {
            storage: {
              sync: { set: (items: Record<string, unknown>) => Promise<void> }
            }
          }
        }
        const dailyRules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          blockedTimeRanges: [],
          dailyLimitMinutes: 0,
        }))
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'redirect',
            redirectUrl: `${origin}/blocked`,
            dailyResetHour: '00:00',
          },
          groups: [
            {
              id: 'paused',
              name: 'Paused',
              mode: 'blacklist',
              lockMode: false,
              patterns: [`^${origin.replaceAll('.', '\\.')}`],
              blockAction: 'redirect',
              redirectUrl: `${origin}/blocked`,
              dailyRules,
            },
          ],
        })
      }, server.origin)
      await page.waitForTimeout(300)
      await serviceWorker.evaluate(async () => {
        const chromeApi = globalThis as unknown as {
          chrome: { storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } } }
        }
        await chromeApi.chrome.storage.local.set({
          groupPauseState: {
            paused: { pausedUntil: Date.now() + 600_000 },
          },
        })
      })
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/target`)
    } finally {
      await server.close()
    }
  })

  test('同じURLを未停止グループもブロックする場合は引き続きリダイレクトする', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await serviceWorker.evaluate(async (origin) => {
        const chromeApi = globalThis as unknown as {
          chrome: {
            storage: {
              sync: { set: (items: Record<string, unknown>) => Promise<void> }
            }
          }
        }
        const dailyRules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          blockedTimeRanges: [],
          dailyLimitMinutes: 0,
        }))
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'redirect',
            redirectUrl: `${origin}/legacy-blocked`,
            dailyResetHour: '00:00',
          },
          groups: [
            {
              id: 'paused',
              name: 'Paused',
              mode: 'blacklist',
              lockMode: false,
              patterns: [`^${origin.replaceAll('.', '\\.')}`],
              blockAction: 'redirect',
              redirectUrl: `${origin}/paused-blocked`,
              dailyRules,
            },
            {
              id: 'active',
              name: 'Active',
              mode: 'blacklist',
              lockMode: false,
              patterns: [`^${origin.replaceAll('.', '\\.')}`],
              blockAction: 'redirect',
              redirectUrl: `${origin}/active-blocked`,
              dailyRules,
            },
          ],
        })
      }, server.origin)
      await page.waitForTimeout(300)
      await serviceWorker.evaluate(async () => {
        const chromeApi = globalThis as unknown as {
          chrome: { storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } } }
        }
        await chromeApi.chrome.storage.local.set({
          groupPauseState: {
            paused: { pausedUntil: Date.now() + 600_000 },
          },
        })
      })
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/active-blocked`)
    } finally {
      await server.close()
    }
  })

  test('redirect 制限は指定 URL へ遷移する', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const origin = server.origin
      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'blockedPage',
              redirectUrl: `${settings.origin}/unused`,
              dailyResetHour: '00:00',
            },
            groups: [
              {
                id: 'redirect-local',
                name: 'Redirect local',
                mode: 'blacklist',
                patterns: [`^${settings.origin.replaceAll('.', '\\.')}`],
                blockAction: 'blockedPage',
                redirectUrl: `${settings.origin}/unused`,
                timeWindows: [{ type: 'always' }],
                restrictions: [{ type: 'redirect', redirectUrl: `${settings.origin}/blocked` }],
              },
            ],
          })
        },
        { origin },
      )
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })
})

test.describe('Effective settings behavior', () => {
  test('Lock Mode ON では緩和しても同じ論理日中は有効設定によりブロックされ続ける', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const effective = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, true)
      const preferred = buildEffectiveSettingsFixture(
        server.origin,
        dailyResetHour,
        undefined,
        true,
      )
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        preferred,
        effective,
        buildLogicalDate(now, dailyResetHour),
      )
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })

  test('disabled group は対象 URL をブロックしない', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const disabled = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, false, true)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        disabled,
        disabled,
        buildLogicalDate(now, dailyResetHour),
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/target`)
    } finally {
      await server.close()
    }
  })

  test('Lock Mode ON では disabled 変更も次回 reset まで反映されずブロックされ続ける', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const effective = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, true, false)
      const preferred = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, true, true)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        preferred,
        effective,
        buildLogicalDate(now, dailyResetHour),
      )
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })

  test('Lock Mode OFF では厳格化すると開いているタブが即時ブロックされる', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const relaxed = buildEffectiveSettingsFixture(server.origin, dailyResetHour, undefined)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        relaxed,
        relaxed,
        buildLogicalDate(now, dailyResetHour),
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/target`)

      const strict = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0)
      await savePreferredSettings(serviceWorker, strict)

      await expect(page).toHaveURL(`${server.origin}/blocked`, { timeout: 5000 })
    } finally {
      await server.close()
    }
  })

  test('Lock Mode OFF ではブロック設定削除後に対象 URL がすぐブロック解除される', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const effective = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        { ...effective, groups: [] },
        effective,
        buildLogicalDate(now, dailyResetHour),
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/target`)
    } finally {
      await server.close()
    }
  })

  test('Lock Mode ON ではブロック設定を削除しても次回 reset まで現在のブロック挙動が残る', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const effective = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, true)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        { ...effective, groups: [] },
        effective,
        buildLogicalDate(now, dailyResetHour),
      )
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })
})

test.describe('Badge display', () => {
  test('時間制限のある URL にアクセスするとバッジに残り時間を表示する', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: '00:00',
            },
            groups: [
              {
                id: 'timed-group',
                name: 'Timed Group',
                mode: 'blacklist',
                patterns: [`^${settings.originEscaped}`],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 60,
                })),
              },
            ],
          })
        },
        { origin: server.origin, originEscaped: server.origin.replaceAll('.', '\\.') },
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      const tabId = await getTabIdByUrl(serviceWorker, `${server.origin}/target`)
      expect(tabId).toBeDefined()

      await expect
        .poll(async () => getBadgeText(serviceWorker, tabId!), { timeout: 5000 })
        .toBe('60m')
    } finally {
      await server.close()
    }
  })

  test('対象外の URL ではバッジが空になる', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: '00:00',
            },
            groups: [
              {
                id: 'timed-group',
                name: 'Timed Group',
                mode: 'blacklist',
                patterns: ['example\\.com'],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 60,
                })),
              },
            ],
          })
        },
        { origin: server.origin },
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/other`)
      const tabId = await getTabIdByUrl(serviceWorker, `${server.origin}/other`)
      expect(tabId).toBeDefined()

      await expect.poll(async () => getBadgeText(serviceWorker, tabId!), { timeout: 5000 }).toBe('')
    } finally {
      await server.close()
    }
  })

  test('消費時間がある場合にバッジが残り時間を正しく反映する', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const dailyResetHour = '00:00'
      const logicalDate = buildLogicalDate(new Date(), dailyResetHour)
      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: { set: (items: Record<string, unknown>) => Promise<void> }
                local: { set: (items: Record<string, unknown>) => Promise<void> }
              }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: settings.dailyResetHour,
            },
            groups: [
              {
                id: 'timed-group',
                name: 'Timed Group',
                mode: 'blacklist',
                patterns: [`^${settings.originEscaped}`],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 60,
                })),
              },
            ],
          })
          await chromeApi.chrome.storage.local.set({
            counters: { 'timed-group': { logicalDate: settings.logicalDate, consumedSec: 600 } },
          })
        },
        {
          origin: server.origin,
          originEscaped: server.origin.replaceAll('.', '\\.'),
          dailyResetHour,
          logicalDate,
        },
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      const tabId = await getTabIdByUrl(serviceWorker, `${server.origin}/target`)
      expect(tabId).toBeDefined()

      await expect
        .poll(async () => getBadgeText(serviceWorker, tabId!), { timeout: 5000 })
        .toBe('50m')
    } finally {
      await server.close()
    }
  })
})

test.describe('Remaining time notifications', () => {
  test('閾値以下になった同じグループは同じ論理日に1回だけ通知される', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = buildLogicalDate(now, dailyResetHour)

      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: { set: (items: Record<string, unknown>) => Promise<void> }
                local: { set: (items: Record<string, unknown>) => Promise<void> }
              }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: settings.dailyResetHour,
              remainingTimeNotificationsEnabled: true,
              notificationThresholdMinutes: 1,
            },
            groups: [
              {
                id: 'notify-group',
                name: 'Notify Group',
                mode: 'blacklist',
                patterns: [`^${settings.originEscaped}`],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 1,
                })),
              },
            ],
          })
          await chromeApi.chrome.storage.local.set({
            counters: { 'notify-group': { logicalDate: settings.logicalDate, consumedSec: 54 } },
            usageNotificationHistory: {},
          })
        },
        {
          origin: server.origin,
          originEscaped: server.origin.replaceAll('.', '\\.'),
          dailyResetHour,
          logicalDate,
        },
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)

      const notificationId = `usage-time-limit-notify-group-${logicalDate}`
      await expect
        .poll(async () => Object.keys(await getNotifications(serviceWorker)), { timeout: 5000 })
        .toContain(notificationId)
    } finally {
      await server.close()
    }
  })

  test('remainingTimeNotificationsEnabled が false なら閾値内でも残り時間通知を出さない', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = buildLogicalDate(now, dailyResetHour)

      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: { set: (items: Record<string, unknown>) => Promise<void> }
                local: { set: (items: Record<string, unknown>) => Promise<void> }
              }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: settings.dailyResetHour,
              remainingTimeNotificationsEnabled: false,
              notificationThresholdMinutes: 1,
            },
            groups: [
              {
                id: 'notify-disabled-group',
                name: 'Notify Disabled Group',
                mode: 'blacklist',
                patterns: [`^${settings.originEscaped}`],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 1,
                })),
              },
            ],
          })
          await chromeApi.chrome.storage.local.set({
            counters: {
              'notify-disabled-group': { logicalDate: settings.logicalDate, consumedSec: 54 },
            },
            usageNotificationHistory: {},
          })
        },
        {
          origin: server.origin,
          originEscaped: server.origin.replaceAll('.', '\\.'),
          dailyResetHour,
          logicalDate,
        },
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)

      const matchingNotifications = Object.keys(await getNotifications(serviceWorker)).filter(
        (id) => id.startsWith('usage-time-limit-notify-disabled-group-'),
      )
      expect(matchingNotifications).toHaveLength(0)
    } finally {
      await server.close()
    }
  })
})

test.describe.skip('Removed page-open and redirect-block notifications', () => {
  test('上限つき対象ページを開くと同じグループは同じ論理日に1回だけ通知される', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = buildLogicalDate(now, dailyResetHour)

      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: { set: (items: Record<string, unknown>) => Promise<void> }
                local: { set: (items: Record<string, unknown>) => Promise<void> }
              }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: settings.dailyResetHour,
              notificationThresholdMinutes: 5,
              pageOpenNotificationsEnabled: true,
              blockNotificationsEnabled: true,
            },
            groups: [
              {
                id: 'page-open-group',
                name: 'Page Open Group',
                mode: 'blacklist',
                patterns: [`^${settings.originEscaped}`],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 60,
                })),
              },
            ],
          })
          await chromeApi.chrome.storage.local.set({
            counters: { 'page-open-group': { logicalDate: settings.logicalDate, consumedSec: 0 } },
            pageOpenNotificationHistory: {},
            blockNotificationHistory: {},
          })
        },
        {
          origin: server.origin,
          originEscaped: server.origin.replaceAll('.', '\\.'),
          dailyResetHour,
          logicalDate,
        },
      )
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target-a`)
      const notificationId = `page-open-limit-${logicalDate}-page-open-group`
      await expect
        .poll(async () => Object.keys(await getNotifications(serviceWorker)), { timeout: 5000 })
        .toContain(notificationId)
    } finally {
      await server.close()
    }
  })

  test('pageOpenNotificationsEnabled が false なら対象ページ通知を出さない', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = buildLogicalDate(now, dailyResetHour)

      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: { set: (items: Record<string, unknown>) => Promise<void> }
                local: { set: (items: Record<string, unknown>) => Promise<void> }
              }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: settings.dailyResetHour,
              notificationThresholdMinutes: 5,
              pageOpenNotificationsEnabled: false,
              blockNotificationsEnabled: true,
            },
            groups: [
              {
                id: 'page-open-disabled-group',
                name: 'Page Open Disabled Group',
                mode: 'blacklist',
                patterns: [`^${settings.originEscaped}`],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 60,
                })),
              },
            ],
          })
          await chromeApi.chrome.storage.local.set({
            counters: {
              'page-open-disabled-group': { logicalDate: settings.logicalDate, consumedSec: 0 },
            },
            pageOpenNotificationHistory: {},
          })
        },
        {
          origin: server.origin,
          originEscaped: server.origin.replaceAll('.', '\\.'),
          dailyResetHour,
          logicalDate,
        },
      )
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)

      const matchingNotifications = Object.keys(await getNotifications(serviceWorker)).filter(
        (id) => id.startsWith('page-open-limit-'),
      )
      expect(matchingNotifications).toHaveLength(0)
    } finally {
      await server.close()
    }
  })

  test('redirect ブロック時に同じグループは同じ論理日に1回だけ通知される', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = buildLogicalDate(now, dailyResetHour)

      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: { set: (items: Record<string, unknown>) => Promise<void> }
                local: { set: (items: Record<string, unknown>) => Promise<void> }
              }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: settings.dailyResetHour,
              notificationThresholdMinutes: 5,
              pageOpenNotificationsEnabled: true,
              blockNotificationsEnabled: true,
            },
            groups: [
              {
                id: 'redirect-block-group',
                name: 'Redirect Block Group',
                mode: 'blacklist',
                patterns: [`^${settings.originEscaped}`],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 0,
                })),
              },
            ],
          })
          await chromeApi.chrome.storage.local.set({
            counters: {
              'redirect-block-group': { logicalDate: settings.logicalDate, consumedSec: 0 },
            },
            blockNotificationHistory: {},
          })
        },
        {
          origin: server.origin,
          originEscaped: server.origin.replaceAll('.', '\\.'),
          dailyResetHour,
          logicalDate,
        },
      )
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target-a`)
      const notificationId = `redirect-block-${logicalDate}-redirect-block-group`
      await expect
        .poll(async () => Object.keys(await getNotifications(serviceWorker)), { timeout: 5000 })
        .toContain(notificationId)
    } finally {
      await server.close()
    }
  })

  test('blockNotificationsEnabled が false なら redirect ブロック通知を出さない', async ({
    page,
    context,
  }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = buildLogicalDate(now, dailyResetHour)

      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: { set: (items: Record<string, unknown>) => Promise<void> }
                local: { set: (items: Record<string, unknown>) => Promise<void> }
              }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: settings.dailyResetHour,
              notificationThresholdMinutes: 5,
              pageOpenNotificationsEnabled: true,
              blockNotificationsEnabled: false,
            },
            groups: [
              {
                id: 'redirect-block-disabled-group',
                name: 'Redirect Block Disabled Group',
                mode: 'blacklist',
                patterns: [`^${settings.originEscaped}`],
                dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 0,
                })),
              },
            ],
          })
          await chromeApi.chrome.storage.local.set({
            counters: {
              'redirect-block-disabled-group': {
                logicalDate: settings.logicalDate,
                consumedSec: 0,
              },
            },
            blockNotificationHistory: {},
          })
        },
        {
          origin: server.origin,
          originEscaped: server.origin.replaceAll('.', '\\.'),
          dailyResetHour,
          logicalDate,
        },
      )
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)

      const matchingNotifications = Object.keys(await getNotifications(serviceWorker)).filter(
        (id) => id.startsWith('redirect-block-'),
      )
      expect(matchingNotifications).toHaveLength(0)
    } finally {
      await server.close()
    }
  })

  test('blockedPage 設定では redirect ブロック通知を出さない', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await clearNotifications(serviceWorker)
      await saveBlockedPageSettings(serviceWorker, server.origin, [
        { id: 'blocked-page-group', name: 'Blocked Page Group' },
      ])
      await page.waitForTimeout(300)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)

      const matchingNotifications = Object.keys(await getNotifications(serviceWorker)).filter(
        (id) => id.startsWith('redirect-block-'),
      )
      expect(matchingNotifications).toHaveLength(0)
    } finally {
      await server.close()
    }
  })

  test('複数グループに該当する対象ページ通知は1件にまとまる', async ({ page, context }) => {
    const server = await startServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = buildLogicalDate(now, dailyResetHour)

      await serviceWorker.evaluate(
        async (settings) => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: { set: (items: Record<string, unknown>) => Promise<void> }
                local: { set: (items: Record<string, unknown>) => Promise<void> }
              }
            }
          }
          await chromeApi.chrome.storage.sync.set({
            global: {
              blockAction: 'redirect',
              redirectUrl: `${settings.origin}/blocked`,
              dailyResetHour: settings.dailyResetHour,
              notificationThresholdMinutes: 5,
              pageOpenNotificationsEnabled: true,
              blockNotificationsEnabled: true,
            },
            groups: ['multi-a', 'multi-b'].map((groupId) => ({
              id: groupId,
              name: groupId,
              mode: 'blacklist',
              patterns: [`^${settings.originEscaped}`],
              dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                dayOfWeek,
                blockedTimeRanges: [],
                dailyLimitMinutes: 60,
              })),
            })),
          })
          await chromeApi.chrome.storage.local.set({
            counters: {
              'multi-a': { logicalDate: settings.logicalDate, consumedSec: 0 },
              'multi-b': { logicalDate: settings.logicalDate, consumedSec: 0 },
            },
            pageOpenNotificationHistory: {},
          })
        },
        {
          origin: server.origin,
          originEscaped: server.origin.replaceAll('.', '\\.'),
          dailyResetHour,
          logicalDate,
        },
      )
      await page.waitForTimeout(300)

      await page.goto(`${server.origin}/target`)
      await expect
        .poll(
          async () =>
            Object.keys(await getNotifications(serviceWorker)).filter((id) =>
              id.startsWith(`page-open-limit-${logicalDate}-`),
            ),
          { timeout: 5000 },
        )
        .toHaveLength(1)
    } finally {
      await server.close()
    }
  })
})
