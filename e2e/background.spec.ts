import type { Worker } from '@playwright/test'
import type {
  BlockDestination,
  Group,
  HHMM,
  Settings,
  TimeRange,
  UsageCounter,
} from '../utils/types'
import { expect, test } from './fixtures'
import {
  gotoAndWaitForUrl,
  savePreferredAndEffectiveSettings,
  savePreferredSettings,
  setExtensionStorage,
  startTestServer,
  waitForEffectiveSettings,
} from './helpers'
import { logicalDateId } from './logicalDate'
import {
  buildEffectiveSettingsFixture,
  buildGroupFixture,
  buildSettingsFixture,
} from './settingsFixture'

/**
 * Service Worker 経由で指定タブのアクション badge テキストを取得する。
 */
async function getBadgeText(serviceWorker: Worker, tabId: number): Promise<string> {
  return serviceWorker.evaluate(async (id) => {
    return globalThis.chrome.action.getBadgeText({ tabId: id })
  }, tabId)
}

/**
 * Service Worker 経由で現在表示中の Chrome 通知一覧を取得する。
 */
async function getNotifications(serviceWorker: Worker): Promise<Record<string, unknown>> {
  return serviceWorker.evaluate(async () => {
    return globalThis.chrome.notifications.getAll()
  })
}

/**
 * Service Worker 経由で現在表示中の Chrome 通知を消去する。
 */
async function clearNotifications(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const notifications = await globalThis.chrome.notifications.getAll()
    await Promise.all(
      Object.keys(notifications).map((id) => globalThis.chrome.notifications.clear(id)),
    )
  })
}

/**
 * Service Worker 経由で指定 URL を持つタブの ID を取得する。
 */
async function getTabIdByUrl(serviceWorker: Worker, url: string): Promise<number | undefined> {
  return serviceWorker.evaluate(async (targetUrl) => {
    const tabs = await globalThis.chrome.tabs.query({ url: targetUrl })
    return tabs[0]?.id
  }, url)
}

/**
 * テスト用 HTTP サーバーを起動する。
 */
async function startServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  return startTestServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (req.url === '/spa') {
      res.end(
        '<!doctype html><button id="go">go</button><script>document.getElementById("go").onclick = () => history.pushState({}, "", "/target")</script>',
      )
      return
    }
    res.end(`<!doctype html><title>${req.url}</title><main>${req.url}</main>`)
  })
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
  await setExtensionStorage(
    serviceWorker,
    'sync',
    buildSettingsFixture(
      [
        buildGroupFixture({
          id: 'block-local',
          name: 'Block local',
          patterns: [pattern],
          rules: [
            {
              id: 'block-local-rule',
              window: { type: 'always' },
              restriction: { kind: 'block' },
              destination: { type: 'redirect', url: `${origin}/blocked` },
            },
          ],
        }),
      ],
      { dailyResetHour: '00:00' },
    ),
  )
}

/** 優先順位・Pause の E2E で使う常時ブロックグループを生成する。 */
function blockingGroup(
  id: string,
  name: string,
  origin: string,
  destination: BlockDestination,
): Group {
  return buildGroupFixture({
    id,
    name,
    patterns: [`^${origin.replaceAll('.', '\\.')}`],
    rules: [
      {
        id: `${id}-rule`,
        window: { type: 'always' },
        restriction: { kind: 'block' },
        destination,
      },
    ],
  })
}

/** badge・通知 E2E で使う常時 Daily limit グループを生成する。 */
function dailyLimitGroup(id: string, name: string, origin: string, minutes: number): Group {
  return buildGroupFixture({
    id,
    name,
    patterns: [`^${origin.replaceAll('.', '\\.')}`],
    rules: [
      {
        id: `${id}-limit`,
        window: { type: 'always' },
        restriction: { kind: 'dailyLimit', minutes },
        destination: { type: 'redirect', url: `${origin}/blocked` },
      },
    ],
  })
}

/**
 * Service Worker 上の storage.sync に拡張ページ表示用の即ブロック設定を書き込む。
 */
async function saveBlockedPageSettings(
  serviceWorker: Worker,
  origin: string,
  groups: Array<{ id: string; name: string }>,
): Promise<void> {
  await setExtensionStorage(
    serviceWorker,
    'sync',
    buildSettingsFixture(
      groups.map((group) =>
        buildGroupFixture({
          ...group,
          patterns: [`^${origin.replaceAll('.', '\\.')}`],
          rules: [
            {
              id: `${group.id}-rule`,
              window: { type: 'always' },
              restriction: { kind: 'block' },
              destination: { type: 'blockedPage' },
            },
          ],
        }),
      ),
      { dailyResetHour: '00:00' },
    ),
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
  await setExtensionStorage(
    serviceWorker,
    'sync',
    buildSettingsFixture(
      groups.map((group) => {
        const window =
          group.blockedTimeRanges.length === 0
            ? ({ type: 'always' } as const)
            : ({
                type: 'scheduled',
                condition: { type: 'daily' },
                timeRanges: group.blockedTimeRanges,
              } as const)
        return buildGroupFixture({
          id: group.id,
          name: group.name,
          patterns: [`^${origin.replaceAll('.', '\\.')}`],
          rules: [
            ...(group.blockedTimeRanges.length > 0
              ? [
                  {
                    id: `${group.id}-block`,
                    window,
                    restriction: { kind: 'block' } as const,
                    destination: { type: 'blockedPage' } as const,
                  },
                ]
              : []),
            ...(group.dailyLimitMinutes !== undefined
              ? [
                  {
                    id: `${group.id}-limit`,
                    window,
                    restriction: {
                      kind: 'dailyLimit' as const,
                      minutes: group.dailyLimitMinutes,
                    },
                    destination: { type: 'blockedPage' } as const,
                  },
                ]
              : []),
          ],
        })
      }),
      { dailyResetHour },
    ),
  )
  await setExtensionStorage(serviceWorker, 'local', {
    counters: Object.fromEntries(
      groups.filter((group) => group.counter).map((group) => [group.id, group.counter]),
    ),
  })
}

/**
 * Service Worker 上に、時間帯付き Daily limit ルール1件だけの blockedPage 設定を書き込む。
 * 旧形式は時間帯を Block ルールへ展開してしまうため、新形式の `rules` を直接保存する。
 */
async function saveWindowedDailyLimitSettings(
  serviceWorker: Worker,
  origin: string,
  dailyResetHour: HHMM,
  group: { id: string; name: string; timeRange: TimeRange; minutes: number; counter: UsageCounter },
): Promise<void> {
  await setExtensionStorage(
    serviceWorker,
    'sync',
    buildSettingsFixture(
      [
        buildGroupFixture({
          id: group.id,
          name: group.name,
          patterns: [`^${origin.replaceAll('.', '\\.')}`],
          rules: [
            {
              id: 'windowed-daily-limit',
              window: {
                type: 'scheduled',
                condition: { type: 'daily' },
                timeRanges: [group.timeRange],
              },
              restriction: { kind: 'dailyLimit', minutes: group.minutes },
              destination: { type: 'blockedPage' },
            },
          ],
        }),
      ],
      { dailyResetHour },
    ),
  )
  await setExtensionStorage(serviceWorker, 'local', {
    counters: { [group.id]: group.counter },
  })
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

test.describe('Background blocking', () => {
  test('該当 URL への新規ナビゲーションを redirectUrl に書き換える', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      await saveBlockingSettings(serviceWorker, server.origin)
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(page, `${server.origin}/target`, `${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })

  test('redirectUrl 自体と extension URL はリダイレクトしない', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      await saveBlockingSettings(serviceWorker, server.origin)
      await waitForEffectiveSettings(serviceWorker)

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
    serviceWorker,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      await saveBlockedPageSettings(serviceWorker, server.origin, [
        { id: 'work', name: 'Work block' },
        { id: 'night', name: 'Night block' },
      ])
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`),
      )
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
    serviceWorker,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const now = new Date()
      const range = buildActiveTimeRange(now)
      await saveBlockedPageDetailSettings(serviceWorker, server.origin, '00:00', [
        {
          id: 'focus-hours',
          name: 'Focus hours',
          blockedTimeRanges: [range],
        },
      ])
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`),
      )
      const reason = page.getByLabel('Focus hours Block')
      await expect(reason).toContainText('Block')
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
    serviceWorker,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      await saveBlockedPageDetailSettings(serviceWorker, server.origin, dailyResetHour, [
        {
          id: 'daily-cap',
          name: 'Daily cap',
          blockedTimeRanges: [],
          dailyLimitMinutes: 15,
          counter: {
            logicalDate: logicalDateId(now, dailyResetHour),
            consumedSec: 15 * 60,
          },
        },
      ])
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`),
      )
      const reason = page.getByLabel('Daily cap Daily limit')
      await expect(reason).toContainText('Daily limit')
      await expect(reason).toContainText('Allow 15 min per day')
      await expect(reason).toContainText('Resets at')
    } finally {
      await server.close()
    }
  })

  test('時間帯付き daily limit ではリセット時刻ではなくウィンドウ終了時刻を表示する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      const now = new Date()
      // リセットは約24時間先、ウィンドウ終了は約1時間先。先に来るのはウィンドウ終了。
      const dailyResetHour = buildStableDailyResetHour(now)
      const range = buildActiveTimeRange(now)
      await saveWindowedDailyLimitSettings(serviceWorker, server.origin, dailyResetHour, {
        id: 'windowed-cap',
        name: 'Windowed cap',
        timeRange: range,
        minutes: 15,
        counter: {
          logicalDate: logicalDateId(now, dailyResetHour),
          consumedSec: 15 * 60,
        },
      })
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`),
      )
      const reason = page.getByLabel('Windowed cap Daily limit')
      await expect(reason).toContainText('Allow 15 min per day')
      await expect(reason).toContainText('Unblocks at')
      await expect(reason).toContainText(formatMinute(range.endMinute))
    } finally {
      await server.close()
    }
  })

  test('blockedPage 設定では複数グループと複数理由を表示する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    const server = await startServer()
    try {
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
            logicalDate: logicalDateId(now, dailyResetHour),
            consumedSec: 5 * 60,
          },
        },
      ])
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`),
      )
      await expect(page.getByText('Blocking groups')).not.toBeVisible()
      await expect(page.getByRole('heading', { name: 'Work block' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Limited block' })).toBeVisible()
      // ブロック理由は原因になったルールの自然文で示す。
      await expect(page.getByLabel('Work block Block')).toContainText('Block access')
      await expect(page.getByLabel('Limited block Daily limit')).toContainText(
        'Allow 5 min per day',
      )
    } finally {
      await server.close()
    }
  })

  test('複数グループ同時ブロックでは表示順が上の blockedPage 設定を優先する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    const server = await startServer()
    try {
      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture(
          [
            blockingGroup('first', 'First', server.origin, { type: 'blockedPage' }),
            blockingGroup('second', 'Second', server.origin, {
              type: 'redirect',
              url: `${server.origin}/second-blocked`,
            }),
          ],
          { dailyResetHour: '00:00' },
        ),
      )
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/blocked\\.html`),
      )
      await expect(page.getByText('Blocking groups')).not.toBeVisible()
      await expect(page.getByRole('heading', { name: 'First' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Second' })).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('複数グループ同時ブロックでは表示順が上の redirect URL を優先する', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture(
          [
            blockingGroup('first', 'First', server.origin, {
              type: 'redirect',
              url: `${server.origin}/first-blocked`,
            }),
            blockingGroup('second', 'Second', server.origin, { type: 'blockedPage' }),
          ],
          { dailyResetHour: '00:00' },
        ),
      )
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(page, `${server.origin}/target`, `${server.origin}/first-blocked`)
    } finally {
      await server.close()
    }
  })

  test('一時停止中のグループだけがブロック理由なら対象 URL へ遷移できる', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture(
          [
            blockingGroup('paused', 'Paused', server.origin, {
              type: 'redirect',
              url: `${server.origin}/blocked`,
            }),
          ],
          { dailyResetHour: '00:00' },
        ),
      )
      await waitForEffectiveSettings(serviceWorker)
      await serviceWorker.evaluate(async () => {
        await globalThis.chrome.storage.local.set({
          groupPauseState: {
            paused: { pausedUntil: Date.now() + 600_000 },
          },
        })
      })
      await waitForEffectiveSettings(serviceWorker)

      await page.goto(`${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/target`)
    } finally {
      await server.close()
    }
  })

  test('同じURLを未停止グループもブロックする場合は引き続きリダイレクトする', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture(
          [
            blockingGroup('paused', 'Paused', server.origin, {
              type: 'redirect',
              url: `${server.origin}/paused-blocked`,
            }),
            blockingGroup('active', 'Active', server.origin, {
              type: 'redirect',
              url: `${server.origin}/active-blocked`,
            }),
          ],
          { dailyResetHour: '00:00' },
        ),
      )
      await waitForEffectiveSettings(serviceWorker)
      await serviceWorker.evaluate(async () => {
        await globalThis.chrome.storage.local.set({
          groupPauseState: {
            paused: { pausedUntil: Date.now() + 600_000 },
          },
        })
      })
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(page, `${server.origin}/target`, `${server.origin}/active-blocked`)
    } finally {
      await server.close()
    }
  })

  test('redirect 制限は指定 URL へ遷移する', async ({ page, serviceWorker }) => {
    const server = await startServer()
    try {
      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture(
          [
            blockingGroup('redirect-local', 'Redirect local', server.origin, {
              type: 'redirect',
              url: `${server.origin}/blocked`,
            }),
          ],
          { dailyResetHour: '00:00' },
        ),
      )
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(page, `${server.origin}/target`, `${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })
})

test.describe('Effective settings behavior', () => {
  test('Lock Mode ON では緩和しても同じ論理日中は有効設定によりブロックされ続ける', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      const dailyResetHour: HHMM = '03:00'
      const effective = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, true)
      await savePreferredSettings(serviceWorker, effective)
      await waitForEffectiveSettings(serviceWorker)

      const relaxed = buildEffectiveSettingsFixture(server.origin, dailyResetHour, undefined, true)
      await savePreferredSettings(serviceWorker, relaxed)
      await waitForEffectiveSettings(serviceWorker)
      await expect
        .poll(async () => {
          return serviceWorker.evaluate(async () => {
            const [preferred, active] = await Promise.all([
              globalThis.chrome.storage.sync.get('groups'),
              globalThis.chrome.storage.local.get('effectiveSettings'),
            ])
            const preferredGroup = (preferred.groups as Settings['groups'])[0]
            const effectiveSettings = active.effectiveSettings as Settings
            return {
              preferredHasRestriction: Boolean(preferredGroup?.rules?.length),
              effectiveHasRestriction: Boolean(effectiveSettings.groups[0]?.rules?.length),
            }
          })
        })
        .toEqual({
          preferredHasRestriction: false,
          effectiveHasRestriction: true,
        })

      await gotoAndWaitForUrl(page, `${server.origin}/target`, `${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })

  test('disabled group は対象 URL をブロックしない', async ({ page, serviceWorker }) => {
    const server = await startServer()
    try {
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const disabled = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, false, true)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        disabled,
        disabled,
        logicalDateId(now, dailyResetHour),
      )
      await waitForEffectiveSettings(serviceWorker)

      await page.goto(`${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/target`)
    } finally {
      await server.close()
    }
  })

  test('Lock Mode ON では disabled 変更も次回 reset まで反映されずブロックされ続ける', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const effective = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, true, false)
      const preferred = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, true, true)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        preferred,
        effective,
        logicalDateId(now, dailyResetHour),
      )
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(page, `${server.origin}/target`, `${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })

  test('Lock Mode OFF では厳格化すると開いているタブが即時ブロックされる', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const relaxed = buildEffectiveSettingsFixture(server.origin, dailyResetHour, undefined)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        relaxed,
        relaxed,
        logicalDateId(now, dailyResetHour),
      )
      await waitForEffectiveSettings(serviceWorker)

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
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const effective = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        { ...effective, groups: [] },
        effective,
        logicalDateId(now, dailyResetHour),
      )
      await waitForEffectiveSettings(serviceWorker)

      await page.goto(`${server.origin}/target`)
      await expect(page).toHaveURL(`${server.origin}/target`)
    } finally {
      await server.close()
    }
  })

  test('Lock Mode ON ではブロック設定を削除しても次回 reset まで現在のブロック挙動が残る', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const effective = buildEffectiveSettingsFixture(server.origin, dailyResetHour, 0, true)
      await savePreferredAndEffectiveSettings(
        serviceWorker,
        { ...effective, groups: [] },
        effective,
        logicalDateId(now, dailyResetHour),
      )
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(page, `${server.origin}/target`, `${server.origin}/blocked`)
    } finally {
      await server.close()
    }
  })
})

test.describe('Badge display', () => {
  test('時間制限のある URL にアクセスするとバッジに残り時間を表示する', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture([dailyLimitGroup('timed-group', 'Timed Group', server.origin, 60)], {
          dailyResetHour: '00:00',
        }),
      )
      await waitForEffectiveSettings(serviceWorker)

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

  test('対象外の URL ではバッジが空になる', async ({ page, serviceWorker }) => {
    const server = await startServer()
    try {
      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture(
          [
            buildGroupFixture({
              ...dailyLimitGroup('timed-group', 'Timed Group', server.origin, 60),
              patterns: ['example\\.com'],
            }),
          ],
          { dailyResetHour: '00:00' },
        ),
      )
      await waitForEffectiveSettings(serviceWorker)

      await page.goto(`${server.origin}/other`)
      const tabId = await getTabIdByUrl(serviceWorker, `${server.origin}/other`)
      expect(tabId).toBeDefined()

      await expect.poll(async () => getBadgeText(serviceWorker, tabId!), { timeout: 5000 }).toBe('')
    } finally {
      await server.close()
    }
  })

  test('消費時間がある場合にバッジが残り時間を正しく反映する', async ({ page, serviceWorker }) => {
    const server = await startServer()
    try {
      const dailyResetHour = '00:00'
      const logicalDate = logicalDateId(new Date(), dailyResetHour)
      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture([dailyLimitGroup('timed-group', 'Timed Group', server.origin, 60)], {
          dailyResetHour,
        }),
      )
      await setExtensionStorage(serviceWorker, 'local', {
        counters: { 'timed-group': { logicalDate, consumedSec: 600 } },
      })
      await waitForEffectiveSettings(serviceWorker)

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
  test('閾値以下になった同じグループは同じ論理日に1回だけ通知される', async ({
    page,
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = logicalDateId(now, dailyResetHour)

      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture([dailyLimitGroup('notify-group', 'Notify Group', server.origin, 1)], {
          dailyResetHour,
          notificationThresholdMinutes: 1,
        }),
      )
      await setExtensionStorage(serviceWorker, 'local', {
        counters: { 'notify-group': { logicalDate, consumedSec: 54 } },
        usageNotificationHistory: {},
      })
      await waitForEffectiveSettings(serviceWorker)

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
    serviceWorker,
  }) => {
    const server = await startServer()
    try {
      await clearNotifications(serviceWorker)
      const now = new Date()
      const dailyResetHour = buildStableDailyResetHour(now)
      const logicalDate = logicalDateId(now, dailyResetHour)

      await setExtensionStorage(
        serviceWorker,
        'sync',
        buildSettingsFixture(
          [dailyLimitGroup('notify-disabled-group', 'Notify Disabled Group', server.origin, 1)],
          {
            dailyResetHour,
            remainingTimeNotificationsEnabled: false,
            notificationThresholdMinutes: 1,
          },
        ),
      )
      await setExtensionStorage(serviceWorker, 'local', {
        counters: { 'notify-disabled-group': { logicalDate, consumedSec: 54 } },
        usageNotificationHistory: {},
      })
      await waitForEffectiveSettings(serviceWorker)

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
