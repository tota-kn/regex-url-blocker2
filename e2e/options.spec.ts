import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
import { GROUP_PAUSE_DURATION_MS, PAUSE_COUNTDOWN_WAIT_MS } from '../utils/constants'
import { expect, test } from './fixtures'

const DEBOUNCE_FLUSH_MS = 400

/**
 * Playwright の file input に渡す JSON ファイル指定を生成する。
 */
function jsonUploadFile(
  name: string,
  value: unknown,
): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  }
}

/**
 * E2E fixture 用の曜日別ルールを生成する。
 */
function dailyRules(override: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
    ...override,
  }))
}

/**
 * Options 画面の General settings セクションを開く。
 */
async function openGeneralSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: /General settings/ }).click()
}

/**
 * ダイアログがビューポート中央に表示されていることを検証する。
 */
async function expectDialogCentered(
  page: Page,
  dialog: ReturnType<Page['locator']>,
): Promise<void> {
  const box = await dialog.boundingBox()
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }))

  expect(box).not.toBeNull()
  expect(box!.x + box!.width / 2).toBeCloseTo(viewport.width / 2, 0)
  expect(box!.y + box!.height / 2).toBeCloseTo(viewport.height / 2, 0)
}

/**
 * 指定した要素で不要な水平スクロールが発生していないことを検証する。
 */
async function expectNoHorizontalOverflow(locator: Locator): Promise<void> {
  const overflow = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

/**
 * 空テンプレートから新規グループドラフトを作成する。
 */
async function createBlankGroup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add group' }).click()
  await page.getByRole('button', { name: 'Create blank group' }).click()
}

/**
 * 編集中グループの Options disclosure を開く。
 */
async function openGroupOptions(page: Page): Promise<void> {
  const optionsButton = page.locator('main').getByRole('button', { name: 'Options' }).last()
  await optionsButton.click()
}

/**
 * グループカードのアクションメニューを開く。
 */
async function openGroupActions(scope: Page | Locator): Promise<void> {
  await scope.getByRole('button', { name: 'Group actions' }).first().click()
}

test.describe('Options 画面', () => {
  test('初期表示は Groups で General settings は非表示', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    const sidebarHeading = page.getByRole('heading', { name: 'Regex URL Guard' })
    await expect(sidebarHeading).toBeVisible()
    const sidebarHeadingHeight = await sidebarHeading.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        actual: element.getBoundingClientRect().height,
        singleLine: Number.parseFloat(style.lineHeight),
      }
    })
    expect(sidebarHeadingHeight.actual).toBeLessThanOrEqual(sidebarHeadingHeight.singleLine * 1.2)
    await expect(page.locator('aside h1 img[src$="/icon/32.png"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Groups' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible()
    await expect(page.getByText('0 groups')).toBeVisible()
    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await expect(page.getByLabel('Start a new rule day at this time')).not.toBeVisible()
  })

  test('General settings を選ぶとグローバル設定と import/export controls が表示される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)

    await expect(page.getByRole('button', { name: /General settings/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('heading', { name: 'General settings' })).toBeVisible()
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('03:00')
    for (const title of [
      'Start a new rule day at this time',
      'Notification',
      'Allow this extension in Incognito',
      'Settings file',
    ]) {
      await expect(page.locator('main').getByText(title, { exact: true }).first()).toHaveCSS(
        'font-weight',
        '600',
      )
    }
    await expect(
      page.locator('main span').filter({ hasText: 'Settings file' }).first().locator('svg'),
    ).toBeVisible()
    await expect(page.locator('main .border-t')).toHaveCount(0)
    const notification = page.getByLabel('Notification')
    await expect(notification).toBeVisible()
    await expect(
      notification.getByRole('checkbox', { name: 'Notify me before the daily limit is reached' }),
    ).toBeChecked()
    await expect(
      notification.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('5')
    await expect(
      notification.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveAttribute('min', '1')
    await expect(
      notification.getByLabel('Notify me when I open a page with a daily limit'),
    ).not.toBeVisible()
    await expect(
      notification.getByLabel('Notify me when a redirect block happens'),
    ).not.toBeVisible()
    const incognitoMode = page.getByLabel('Allow this extension in Incognito')
    await expect(incognitoMode).toBeVisible()
    await expect(
      incognitoMode.getByText(/Incognito access:\s+(Enabled|Disabled|Unable to check)/),
    ).toBeVisible()
    await expect(
      incognitoMode.getByRole('button', { name: 'Open Chrome extension settings' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import settings' })).toBeVisible()
    await expect(page.getByText('Import replaces all groups and general settings.')).toBeVisible()
  })

  test('グループ一時停止は集中ダイアログで60秒待機後に10分停止を保存する', async ({
    page,
    context,
    extensionId,
  }) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'blockedPage',
          redirectUrl: 'https://blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'pause-target',
            name: 'Pause target',
            mode: 'blacklist',
            lockMode: false,
            patterns: ['example\\.com'],
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 0,
            })),
          },
        ],
      })
    })
    const startTime = new Date('2026-05-06T12:00:00+09:00')
    await page.clock.install({ time: startTime })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Request pause' }).click()
    const pauseDialog = page.locator('dialog').filter({ hasText: 'Take a breath' })
    await expect(pauseDialog.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
    await expect(pauseDialog.getByText('60s remaining')).toBeVisible()
    await expect(pauseDialog.getByRole('button', { name: 'Pause 10 min' })).toBeDisabled()
    const editButtonBox = await page.getByRole('button', { name: 'Edit group' }).boundingBox()
    expect(editButtonBox).not.toBeNull()
    const elementAtEditButton = await page.evaluate(
      ({ x, y }) => {
        return document.elementFromPoint(x, y)?.closest('dialog')?.textContent ?? ''
      },
      {
        x: editButtonBox!.x + editButtonBox!.width / 2,
        y: editButtonBox!.y + editButtonBox!.height / 2,
      },
    )
    expect(elementAtEditButton).toContain('Take a breath')
    let stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-target']?.waitingUntil).toBeUndefined()
    expect(stored.groupPauseState?.['pause-target']?.pausedUntil).toBeUndefined()

    await page.clock.fastForward(59_000)
    await expect(pauseDialog.getByRole('button', { name: 'Pause 10 min' })).toBeDisabled()
    stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-target']?.pausedUntil).toBeUndefined()

    await page.clock.fastForward(1_000)
    await expect(pauseDialog.getByRole('button', { name: 'Pause 10 min' })).toBeEnabled()
    await pauseDialog.getByRole('button', { name: 'Pause 10 min' }).click()
    await expect(page.getByText(/Paused 10:00|Paused 9:59/)).toBeVisible()
    stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    const pausedUntil = stored.groupPauseState?.['pause-target']?.pausedUntil
    expect(pausedUntil).toBeGreaterThanOrEqual(
      startTime.getTime() + PAUSE_COUNTDOWN_WAIT_MS + GROUP_PAUSE_DURATION_MS,
    )
    expect(pausedUntil).toBeLessThan(
      startTime.getTime() + PAUSE_COUNTDOWN_WAIT_MS + GROUP_PAUSE_DURATION_MS + 1_000,
    )
    expect(stored.groupPauseState?.['pause-target']?.waitingUntil).toBeUndefined()
  })

  test('一時停止前カウントダウンのキャンセルとフォーカス喪失は保存しない', async ({
    page,
    context,
    extensionId,
  }) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'blockedPage',
          redirectUrl: 'https://blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'pause-cancel-target',
            name: 'Pause cancel target',
            mode: 'blacklist',
            lockMode: false,
            patterns: ['example\\.com'],
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 0,
            })),
          },
        ],
      })
    })
    await page.clock.install({ time: new Date('2026-05-06T12:00:00+09:00') })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Request pause' }).click()
    const pauseDialog = page.locator('dialog').filter({ hasText: 'Take a breath' })
    await expect(pauseDialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await pauseDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(pauseDialog).not.toBeVisible()

    let stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-cancel-target']).toBeUndefined()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Request pause' }).click()
    await expect(pauseDialog.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(pauseDialog).not.toBeVisible()
    stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-cancel-target']).toBeUndefined()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Request pause' }).click()
    await expect(pauseDialog.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(pauseDialog).not.toBeVisible()
    stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-cancel-target']).toBeUndefined()
  })

  test('Incognito mode の Chrome 拡張詳細ページを開ける', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    const pagePromise = context.waitForEvent('page')
    await page.getByRole('button', { name: 'Open Chrome extension settings' }).click()
    const extensionSettingsPage = await pagePromise

    await expect(extensionSettingsPage).toHaveURL(`chrome://extensions/?id=${extensionId}`)
  })

  test('セクション切り替え時にサイドバーの位置がずれない', async ({
    page,
    context,
    extensionId,
  }) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await serviceWorker.evaluate(async () => {
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
        groups: Array.from({ length: 12 }, (_, index) => ({
          id: `group-${index}`,
          name: `Group ${index + 1}`,
          mode: 'blacklist',
          patterns: [`example-${index}\\.com`],
          dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: undefined,
          })),
        })),
      })
    })
    await page.setViewportSize({ width: 1100, height: 700 })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    const sidebarHeading = page.getByRole('heading', { name: 'Regex URL Guard' })
    const groupsBox = await sidebarHeading.boundingBox()
    expect(groupsBox).not.toBeNull()

    await openGeneralSettings(page)
    const generalBox = await sidebarHeading.boundingBox()
    expect(generalBox).not.toBeNull()

    expect(generalBox!.x).toBeCloseTo(groupsBox!.x, 1)
    expect(generalBox!.width).toBeCloseTo(groupsBox!.width, 1)
  })

  test('残り時間通知の ON/OFF と分数設定を保存できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await page.getByLabel('Minutes before daily limit warning', { exact: true }).fill('12')
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()
    await openGeneralSettings(page)
    await expect(
      page.getByRole('checkbox', { name: 'Notify me before the daily limit is reached' }),
    ).toBeChecked()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('12')

    await page
      .getByRole('checkbox', { name: 'Notify me before the daily limit is reached' })
      .uncheck()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()
    await openGeneralSettings(page)
    await expect(
      page.getByRole('checkbox', { name: 'Notify me before the daily limit is reached' }),
    ).not.toBeChecked()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('12')

    await page
      .getByRole('checkbox', { name: 'Notify me before the daily limit is reached' })
      .check()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toBeEnabled()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('12')

    await page.getByLabel('Minutes before daily limit warning', { exact: true }).fill('0')
    await expect(page.getByText('Use 1+ integer')).toBeVisible()
  })

  test('設定を JSON ファイルとしてエクスポートできる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Exported')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGeneralSettings(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export settings' }).click()
    const download = await downloadPromise
    const path = await download.path()

    expect(download.suggestedFilename()).toBe('regex-url-guard-settings.json')
    expect(path).not.toBeNull()

    const exported = JSON.parse(await fs.readFile(path!, 'utf8')) as Record<string, unknown>
    expect(exported.version).toBe(9)
    expect(exported.settings).toMatchObject({
      groups: [{ name: 'Exported', patterns: ['example\\.com'] }],
    })
  })

  test('設定ファイルをインポートすると既存設定が全置換される', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('BeforeImport')
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await openGeneralSettings(page)
    await page.getByLabel('Settings JSON file').setInputFiles(
      jsonUploadFile('settings.json', {
        version: 2,
        settings: {
          global: {
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            dailyResetHour: '04:30',
            notificationThresholdMinutes: 9,
          },
          groups: [
            {
              id: 'imported-group',
              name: 'Imported',
              mode: 'blacklist',
              patterns: ['imported\\.example'],
              dailyRules: dailyRules({ dailyLimitMinutes: 15 }),
            },
          ],
        },
      }),
    )

    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('04:30')
    await expect(
      page.getByRole('checkbox', { name: 'Notify me before the daily limit is reached' }),
    ).toBeChecked()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('9')
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('Imported')
    await expect(page.locator('main').getByText('Options')).not.toBeVisible()
    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    await expect(urlPatternsSection.getByText('imported\\.example', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
    await expect(page.getByLabel('Restriction 1')).toContainText('15 min/day')
    await expect(page.getByText('BeforeImport')).not.toBeVisible()

    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    const stored = (await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: {
              get: (keys: string[]) => Promise<Record<string, unknown>>
            }
          }
        }
      }
      return chromeApi.chrome.storage.sync.get(['global', 'groups'])
    })) as { global?: Record<string, unknown>; groups?: Array<Record<string, unknown>> }
    expect(stored.global?.dailyResetHour).toBe('04:30')
    expect(stored.global?.remainingTimeNotificationsEnabled).toBe(true)
    expect(stored.global?.notificationThresholdMinutes).toBe(9)
    expect(stored.groups).toHaveLength(1)
    expect(stored.groups?.[0].name).toBe('Imported')
  })

  test('保留中は希望設定を表示し、現在適用中の有効設定を確認できる', async ({
    page,
    context,
    extensionId,
  }) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
            local: { set: (items: Record<string, unknown>) => Promise<void> }
          }
        }
      }
      const activeSettings = {
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://active-blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'work',
            name: 'Work',
            mode: 'blacklist',
            lockMode: true,
            patterns: ['active\\.example'],
            blockAction: 'redirect',
            redirectUrl: 'https://active-blocked.test',
            dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [{ startMinute: 540, endMinute: 1020 }],
              dailyLimitMinutes: 10,
            })),
          },
          {
            id: 'allowlist',
            name: 'Allowlist',
            mode: 'whitelist',
            lockMode: false,
            patterns: [],
            blockAction: 'blockedPage',
            redirectUrl: 'https://unused-blocked.test',
            dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: undefined,
            })),
          },
        ],
      }
      const now = new Date()
      const reset = new Date(now)
      reset.setHours(3, 0, 0, 0)
      if (now.getTime() < reset.getTime()) reset.setDate(reset.getDate() - 1)
      const logicalDate = [
        reset.getFullYear(),
        String(reset.getMonth() + 1).padStart(2, '0'),
        String(reset.getDate()).padStart(2, '0'),
      ].join('-')
      await chromeApi.chrome.storage.local.set({
        effectiveSettings: activeSettings,
        effectiveSettingsLogicalDate: logicalDate,
      })
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://preferred-blocked.test',
          dailyResetHour: '05:00',
        },
        groups: [
          {
            id: 'work',
            name: 'Work',
            mode: 'blacklist',
            lockMode: true,
            patterns: ['active\\.example'],
            blockAction: 'redirect',
            redirectUrl: 'https://preferred-blocked.test',
            dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 30,
            })),
          },
          {
            id: 'allowlist',
            name: 'Allowlist',
            mode: 'whitelist',
            lockMode: false,
            patterns: [],
            blockAction: 'blockedPage',
            redirectUrl: 'https://unused-blocked.test',
            dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: undefined,
            })),
          },
        ],
      })
    })

    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('03:00')
    await expect(page.getByLabel('Start a new rule day at this time')).toBeDisabled()
    await expect(
      page.getByText('Cannot change while any group has Lock Mode enabled or pending.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Time window 1').first()).toContainText('Always')
    await expect(page.getByLabel('Restriction 1').first()).toContainText('30 min/day')
    await expect(page.getByText('Earlier restrictions are still active.')).toBeVisible()
    await expect(
      page.getByText(/Stricter saved changes apply now\..*rule day starts at 03:00/s),
    ).toBeVisible()
    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Request pause' }).first()).toBeDisabled()
    await expect(page.getByText('Use active settings to pause.')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Active settings only' })).toHaveCount(0)

    await page.getByRole('button', { name: 'View active settings' }).click()

    const activeSettingsDialog = page
      .locator('dialog')
      .filter({ hasText: 'Currently active settings' })
    await expect(page.getByRole('heading', { name: 'Currently active settings' })).toBeVisible()
    await expectDialogCentered(page, activeSettingsDialog)
    await expect(activeSettingsDialog.getByText('General settings')).not.toBeVisible()
    await expect(
      activeSettingsDialog.getByText('Start a new rule day at this time'),
    ).not.toBeVisible()
    await expect(activeSettingsDialog.getByText('Notify me')).not.toBeVisible()
    await expect(activeSettingsDialog.getByLabel('Name').first()).toHaveValue('Work')
    await expect(activeSettingsDialog.getByLabel('Name').nth(1)).toHaveValue('Allowlist')
    await expect(activeSettingsDialog.getByText('Earlier restrictions still active')).toBeVisible()
    await expect(activeSettingsDialog.getByRole('button', { name: 'Edit group' })).not.toBeVisible()
    await expect(
      activeSettingsDialog.getByRole('button', { name: 'Delete group' }),
    ).not.toBeVisible()
    await expect(activeSettingsDialog.getByText('URL patterns').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('Restrictions').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('Options').first()).toBeVisible()
    await expect(
      activeSettingsDialog.getByText('Delay relaxed restrictions until next rule day').first(),
    ).toBeVisible()
    await expect(
      activeSettingsDialog.getByText('active\\.example', { exact: true }).first(),
    ).toBeVisible()
    await expect(activeSettingsDialog.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
    await expect(activeSettingsDialog.getByLabel('Time window 1').first()).toContainText('Always')
    await expect(activeSettingsDialog.getByLabel('Restriction 1').first()).toContainText(
      '30 min/day',
    )
    const retainedSettings = activeSettingsDialog
      .locator('section')
      .filter({ hasText: 'Earlier restrictions still active' })
    await expect(retainedSettings.getByLabel('Time window 1')).toContainText('09:00-17:00')
    await expect(retainedSettings.getByLabel('Restriction 2')).toContainText('10 min/day')
    const headerBox = await activeSettingsDialog
      .locator('[aria-label="Active settings header"]')
      .boundingBox()
    const firstRuleBox = await activeSettingsDialog
      .getByLabel('Time window 1')
      .first()
      .boundingBox()
    expect(headerBox).not.toBeNull()
    expect(firstRuleBox).not.toBeNull()
    expect(firstRuleBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height)
    await expectNoHorizontalOverflow(activeSettingsDialog.getByLabel('Active settings content'))
    await openGroupActions(activeSettingsDialog)
    await activeSettingsDialog.getByRole('menuitem', { name: 'Request pause' }).first().click()
    const pauseDialog = page.locator('dialog').filter({ hasText: 'Take a breath' })
    await expect(pauseDialog.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
    await expect(pauseDialog.getByRole('button', { name: 'Pause 10 min' })).toBeDisabled()

    const storedPauseState = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(storedPauseState.groupPauseState?.work).toBeUndefined()
  })

  test('Lock Mode ON のグループを Disable しても同じ論理日中は active settings で有効のまま表示する', async ({
    page,
    context,
    extensionId,
  }) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
            local: { set: (items: Record<string, unknown>) => Promise<void> }
          }
        }
      }
      const settings = {
        global: {
          blockAction: 'blockedPage',
          redirectUrl: 'https://blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'locked-disable',
            name: 'Locked disable',
            mode: 'blacklist',
            disabled: false,
            lockMode: true,
            patterns: ['example\\.com'],
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 0,
            })),
          },
        ],
      }
      const now = new Date()
      const reset = new Date(now)
      reset.setHours(3, 0, 0, 0)
      if (now.getTime() < reset.getTime()) reset.setDate(reset.getDate() - 1)
      const logicalDate = [
        reset.getFullYear(),
        String(reset.getMonth() + 1).padStart(2, '0'),
        String(reset.getDate()).padStart(2, '0'),
      ].join('-')
      await chromeApi.chrome.storage.local.set({
        effectiveSettings: settings,
        effectiveSettingsLogicalDate: logicalDate,
      })
      await chromeApi.chrome.storage.sync.set(settings)
    })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Disable' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Disabled' })).toBeVisible()
    await expect(page.getByText('Earlier restrictions are still active.')).toBeVisible()
    await page.getByRole('button', { name: 'View active settings' }).click()
    const activeSettingsDialog = page
      .locator('dialog')
      .filter({ hasText: 'Currently active settings' })
    await expect(activeSettingsDialog.getByLabel('Name').first()).toHaveValue('Locked disable')
    await expect(
      activeSettingsDialog.getByRole('status').filter({ hasText: 'Disabled' }).first(),
    ).toBeVisible()
    const retainedSettings = activeSettingsDialog
      .locator('section')
      .filter({ hasText: 'Earlier restrictions still active' })
    await expect(
      retainedSettings.getByRole('status').filter({ hasText: 'Disabled' }),
    ).not.toBeVisible()
    await expect(
      activeSettingsDialog.getByText('Delay relaxed restrictions until next rule day').first(),
    ).toBeVisible()
  })

  test('希望設定から削除済みの active group も active settings から一時停止できる', async ({
    page,
    context,
    extensionId,
  }) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
            local: { set: (items: Record<string, unknown>) => Promise<void> }
          }
        }
      }
      const activeSettings = {
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://active-blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'deleted-active',
            name: 'Deleted active',
            mode: 'blacklist',
            lockMode: true,
            patterns: ['deleted\\.example'],
            blockAction: 'redirect',
            redirectUrl: 'https://active-blocked.test',
            dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 0,
            })),
          },
        ],
      }
      const now = new Date()
      const reset = new Date(now)
      reset.setHours(3, 0, 0, 0)
      if (now.getTime() < reset.getTime()) reset.setDate(reset.getDate() - 1)
      const logicalDate = [
        reset.getFullYear(),
        String(reset.getMonth() + 1).padStart(2, '0'),
        String(reset.getDate()).padStart(2, '0'),
      ].join('-')
      await chromeApi.chrome.storage.local.set({
        effectiveSettings: activeSettings,
        effectiveSettingsLogicalDate: logicalDate,
        groupPauseState: {
          'deleted-active': { waitingUntil: Date.now() - 1 },
        },
      })
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://preferred-blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [],
      })
    })
    const beforePauseStart = Date.now()
    await page.clock.install({ time: beforePauseStart })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByText('Earlier restrictions are still active.')).toBeVisible()
    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    await page.getByRole('button', { name: 'View active settings' }).click()

    const activeSettingsDialog = page
      .locator('dialog')
      .filter({ hasText: 'Currently active settings' })
    await expect(activeSettingsDialog.getByLabel('Name')).toHaveValue('Deleted active')
    await expect(activeSettingsDialog.getByRole('button', { name: 'Edit group' })).not.toBeVisible()
    await expect(
      activeSettingsDialog.getByRole('button', { name: 'Delete group' }),
    ).not.toBeVisible()
    await openGroupActions(activeSettingsDialog)
    await activeSettingsDialog.getByRole('menuitem', { name: 'Request pause' }).click()
    const pauseDialog = page.locator('dialog').filter({ hasText: 'Take a breath' })
    await expect(pauseDialog.getByRole('button', { name: 'Pause 10 min' })).toBeDisabled()
    await page.clock.fastForward(PAUSE_COUNTDOWN_WAIT_MS)
    await expect(pauseDialog.getByRole('button', { name: 'Pause 10 min' })).toBeEnabled()
    await pauseDialog.getByRole('button', { name: 'Pause 10 min' }).click()
    await expect(activeSettingsDialog.getByText(/Paused \d+:\d{2}/)).toBeVisible()

    const storedPauseState = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (
                keys: string[],
              ) => Promise<{ groupPauseState?: Record<string, { pausedUntil?: number }> }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(
      storedPauseState.groupPauseState?.['deleted-active']?.pausedUntil,
    ).toBeGreaterThanOrEqual(beforePauseStart + GROUP_PAUSE_DURATION_MS)
  })

  test('不正な設定ファイルはインポートせず既存設定を残す', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('StillHere')
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await openGeneralSettings(page)
    await page.getByLabel('Settings JSON file').setInputFiles(jsonUploadFile('bad.json', '{'))

    await expect(page.getByText('Invalid JSON')).toBeVisible()
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('StillHere')
  })

  test('グループ追加時に名前がデフォルトで「グループ1」になる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    const createDialog = page.locator('dialog').filter({ hasText: 'Create group' })
    await expect(page.getByRole('heading', { name: 'Create group' })).toBeVisible()
    await expectDialogCentered(page, createDialog)
    await page.getByRole('button', { name: 'Create blank group' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('Group 1')
    await expect(page.getByLabel('Name')).toBeFocused()
    await expect(page.getByLabel('No groups')).not.toBeVisible()
    await expect(page.getByText('New group')).toBeVisible()

    await createBlankGroup(page)
    await expect(page.getByLabel('Name').first()).toHaveValue('Group 1')
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Group 2')
    await expect(page.getByLabel('Name').nth(1)).toBeFocused()
  })

  test('グループ作成ダイアログをキャンセルすると新規カードを作らない', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await expect(page.getByRole('button', { name: 'Create blank group' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from core SNS 15 min/day template' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from video 30 min/day template' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from work hours focus template' }),
    ).toBeVisible()
    await expect(page.getByText('30 min/day', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Block nights', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Allow nights', { exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Cancel create group' }).click()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    await expect(page.getByText('New group')).not.toBeVisible()
  })

  test('Core SNS 15 min/day テンプレートからSNSパターンと全曜日15分上限のグループを作成できる', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page
      .getByRole('button', { name: 'Create group from core SNS 15 min/day template' })
      .click()

    const expectedPatterns = [
      'x.com',
      'twitter.com',
      'instagram.com',
      'facebook.com',
      'tiktok.com',
      'threads.net',
      'bsky.app',
    ]
    const patternInputs = page.getByRole('textbox', { name: 'URL pattern' })
    await expect(patternInputs).toHaveCount(expectedPatterns.length)
    for (const [index, pattern] of expectedPatterns.entries()) {
      await expect(patternInputs.nth(index)).toHaveValue(pattern)
    }

    await expect(page.getByLabel('Time window type')).toHaveValue('always')
    await expect(page.getByLabel('Grace minutes per day')).toHaveValue('15')
  })

  test('Video 30 min/day テンプレートから動画パターンと全曜日30分上限のグループを作成できる', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Create group from video 30 min/day template' }).click()

    const expectedPatterns = [
      'youtube.com',
      'youtu.be',
      'twitch.tv',
      'netflix.com',
      'primevideo.com',
      'abema.tv',
      'nicovideo.jp',
    ]
    const patternInputs = page.getByRole('textbox', { name: 'URL pattern' })
    await expect(patternInputs).toHaveCount(expectedPatterns.length)
    for (const [index, pattern] of expectedPatterns.entries()) {
      await expect(patternInputs.nth(index)).toHaveValue(pattern)
    }

    await expect(page.getByLabel('Time window type')).toHaveValue('always')
    await expect(page.getByLabel('Grace minutes per day')).toHaveValue('30')
  })

  test('Work hours focus テンプレートから平日日中ブロックのグループを作成できる', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Create group from work hours focus template' }).click()

    await expect(page.getByLabel('Time window type')).toHaveValue('weekly')
    await expect(page.getByLabel('Active time ranges')).toHaveValue('09:00-18:00')
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      await expect(page.getByRole('checkbox', { name: day })).toBeChecked()
    }
    for (const day of ['Sunday', 'Saturday']) {
      await expect(page.getByRole('checkbox', { name: day })).not.toBeChecked()
    }

    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByLabel('Time window 1')).toContainText('Weekly Mon, Tue, Wed, Thu, Fri')
    await expect(page.getByLabel('Time window 1')).toContainText('09:00-18:00')
  })

  test('Options disclosure には高度な設定だけを表示し、Redirect は Restriction 種別で選ぶ', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Locked')
    const optionsButton = page.locator('main').getByRole('button', { name: 'Options' }).last()
    await expect(optionsButton).toBeVisible()
    await expect(optionsButton).toHaveAttribute('aria-expanded', 'false')
    // 廃止済み: URL pattern match behavior / Page shown when blocked セクション
    await expect(
      page.getByRole('radio', { name: 'URL pattern match behavior Block matches' }),
    ).toHaveCount(0)
    await expect(page.locator('fieldset[aria-label="Page shown when blocked"]')).toHaveCount(0)
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day Off' }),
    ).not.toBeVisible()

    // Redirect は Restriction の種別として選び、その場で URL を入力する
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await page.getByRole('button', { name: 'Add restriction' }).last().click()
    await page.getByLabel('Restriction type').last().selectOption('redirect')
    await expect(page.getByLabel('Redirect URL')).toBeVisible()

    await optionsButton.click()
    await expect(optionsButton).toHaveAttribute('aria-expanded', 'true')
    const optionsPanel = page.locator('main [id^="options-panel-"]').last()
    await expect(
      optionsPanel.getByRole('radio', { name: 'URL pattern match behavior Block matches' }),
    ).toHaveCount(0)
    await expect(
      optionsPanel.getByRole('radio', {
        name: 'Delay relaxed restrictions until next rule day Off',
      }),
    ).toBeChecked()
    await expect(
      optionsPanel.getByRole('radio', {
        name: 'Delay relaxed restrictions until next rule day On',
      }),
    ).toBeVisible()
    await expect(
      optionsPanel.getByText(
        'Stricter changes apply immediately. Relaxed restrictions take effect on the next rule day.',
      ),
    ).toBeVisible()
    await optionsPanel
      .getByRole('radio', { name: 'Delay relaxed restrictions until next rule day On' })
      .check()
    await expect(
      optionsPanel.getByRole('radio', {
        name: 'Delay relaxed restrictions until next rule day On',
      }),
    ).toBeChecked()
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.locator('main').getByText('Options')).toBeVisible()
    await expect(
      page.locator('main').getByText('Delay relaxed restrictions until next rule day'),
    ).toBeVisible()
    await expect(
      page.getByText(
        'Stricter changes apply immediately. Relaxed restrictions take effect on the next rule day.',
      ),
    ).not.toBeVisible()
    await expect(page.locator('main').getByText('On', { exact: true })).toBeVisible()
    await expect(
      page.locator('main').getByText('Page shown when blocked', { exact: true }),
    ).not.toBeVisible()
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day On' }),
    ).not.toBeVisible()
    await page.getByRole('button', { name: 'Edit group' }).click()
    await openGroupOptions(page)
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day On' }),
    ).toBeChecked()
    await page
      .getByRole('radio', { name: 'Delay relaxed restrictions until next rule day Off' })
      .check()
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day Off' }),
    ).toBeChecked()
  })

  test('Lock Mode group がある間、rule day 開始時刻入力が無効化される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LockedReset')
    await openGroupOptions(page)
    await page
      .getByRole('radio', { name: 'Delay relaxed restrictions until next rule day On' })
      .check()
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await openGeneralSettings(page)
    await expect(page.getByLabel('Start a new rule day at this time')).toBeDisabled()
    await expect(
      page.getByText('Cannot change while any group has Lock Mode enabled or pending.'),
    ).toBeVisible()
  })

  test('保存済みグループの下に新規ドラフトを追加する', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Saved')
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await createBlankGroup(page)
    await expect(page.getByLabel('Name').first()).toHaveValue('Saved')
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Group 2')
    await expect(page.getByLabel('Name').nth(1)).toBeFocused()
  })

  test('パターン追加時に空の URL pattern 入力が追加される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveAttribute(
      'placeholder',
      'example.com or ^https?://(www\\.)?example\\.com/private',
    )
    await expect(page.getByText('Invalid URL pattern')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Delete pattern' })).toBeVisible()
  })

  test('空の各ルールセクションでは空状態を表示せず、統一された追加ボタンを表示する', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    const restrictionSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Time windows' }) })
      .last()
    const addButtons = [
      urlPatternsSection.getByRole('button', { name: 'Add URL pattern' }),
      restrictionSection.getByRole('button', { name: 'Add time window' }),
      restrictionSection.getByRole('button', { name: 'Add restriction' }),
    ]

    await expect(page.getByLabel('No URL patterns')).toHaveCount(0)
    await expect(page.getByLabel('No time windows')).toHaveCount(0)
    await expect(page.getByLabel('No restrictions')).toHaveCount(0)

    for (const addButton of addButtons) {
      await expect(addButton).toBeVisible()
      await expect(addButton).toHaveClass(/border-primary\/30/)
    }

    await expect(addButtons[0]).toHaveText('URL pattern')
    await expect(addButtons[1]).toHaveText('Time window')
    await expect(addButtons[2]).toHaveText('Restriction')

    const [
      patternsHeadingBox,
      patternButtonBox,
      timeWindowsHeadingBox,
      timeWindowButtonBox,
      restrictionsHeadingBox,
      restrictionButtonBox,
    ] = await Promise.all([
      urlPatternsSection.getByRole('heading', { name: 'URL patterns' }).boundingBox(),
      addButtons[0].boundingBox(),
      restrictionSection.getByRole('heading', { name: 'Time windows' }).boundingBox(),
      addButtons[1].boundingBox(),
      restrictionSection.getByRole('heading', { name: 'Restrictions' }).boundingBox(),
      addButtons[2].boundingBox(),
    ])
    expect(patternButtonBox!.y).toBeGreaterThan(patternsHeadingBox!.y)
    expect(timeWindowButtonBox!.y).toBeGreaterThan(timeWindowsHeadingBox!.y)
    expect(restrictionButtonBox!.y).toBeGreaterThan(restrictionsHeadingBox!.y)
  })

  test('編集可能な入力欄は共通の field 色で表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('textbox', { name: 'URL pattern' }).blur()
    await page.getByRole('button', { name: 'Add time window' }).click()
    await page.getByLabel('Time window type').selectOption('daily')
    await page.getByRole('button', { name: 'Add restriction' }).click()
    await page.getByLabel('Restriction type').last().selectOption('grace')
    const groupInputs = [
      page.getByLabel('Name'),
      page.getByRole('textbox', { name: 'URL pattern' }),
      page.getByLabel('Active time ranges'),
      page.getByLabel('Grace minutes per day'),
    ]

    for (const input of groupInputs) {
      await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(input).toHaveCSS('border-top-color', 'rgb(209, 213, 219)')
    }

    await openGeneralSettings(page)
    const generalInputs = [
      page.getByLabel('Start a new rule day at this time'),
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ]

    for (const input of generalInputs) {
      await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(input).toHaveCSS('border-top-color', 'rgb(209, 213, 219)')
    }
  })

  test('グループを追加して保存→リロード後も保持される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Twitter')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page
      .getByRole('textbox', { name: 'URL pattern' })
      .fill('^https?://(www\\.)?twitter\\.com')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    await expect(page.getByLabel('Name')).toHaveValue('Twitter')
    await expect(
      urlPatternsSection.getByText('^https?://(www\\.)?twitter\\.com', { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Name')).toBeDisabled()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Group actions' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).not.toBeVisible()
  })

  test('スケジュールルールの待機秒を保存→リロード後も保持される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Wait gate')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add restriction' }).click()
    await page.getByLabel('Restriction type').selectOption('wait')
    await page.getByLabel('Wait seconds before access').fill('30')
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.getByLabel('Restriction 1')).toContainText('Wait 30 sec')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Restriction 1')).toContainText('Wait 30 sec')
    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByLabel('Wait seconds before access')).toHaveValue('30')
  })

  test('ケバブメニューからグループを無効化し、リロード後も Disabled 表示を保持する', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Disabled target')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Disable' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Disabled' })).toBeVisible()
    await expect(page.getByText('Group status')).toBeVisible()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Disabled target')
    await expect(page.getByRole('status').filter({ hasText: 'Disabled' })).toBeVisible()
    await expect(page.getByText('Group status')).toBeVisible()
    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Request pause' })).toBeDisabled()
    await expect(page.getByText('Enable group to pause.')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Enable' })).toBeEnabled()

    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    const stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { get: (keys: string[]) => Promise<{ groups?: Array<Record<string, unknown>> }> }
          }
        }
      }
      return chromeApi.chrome.storage.sync.get(['groups'])
    })
    expect(stored.groups?.[0].disabled).toBe(true)

    await page.getByRole('menuitem', { name: 'Enable' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Disabled' })).not.toBeVisible()
    await expect(page.getByText('Enable group to pause.')).not.toBeVisible()
    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Request pause' })).toBeEnabled()
    await page.getByRole('menuitem', { name: 'Request pause' }).click()
    await expect(
      page
        .locator('dialog')
        .filter({ hasText: 'Take a breath' })
        .getByRole('heading', { name: 'Take a breath' }),
    ).toBeVisible()
  })

  test('ドメイン指定の URL pattern を保存できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('DomainBlock')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    await expect(page.getByLabel('Name')).toHaveValue('DomainBlock')
    await expect(urlPatternsSection.getByText('example.com', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
  })

  test('新規グループ作成をキャンセルすると保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('DraftOnly')
    await page.getByRole('button', { name: 'Cancel group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
  })

  test('既存グループ編集をキャンセルすると保存済み値へ戻る', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Saved')
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeVisible()
    await page.getByLabel('Name').fill('Unsaved')
    await page.getByRole('button', { name: 'Cancel group' }).click()
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Saved')
    await expect(page.getByText('Unsaved')).not.toBeVisible()
  })

  test('グループ名は編集モードでのみ編集でき、名前欄の編集アイコンは表示しない', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyName')
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeDisabled()

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeEnabled()
    await expect(
      page.getByRole('button', { name: 'Create group from core SNS 15 min/day template' }),
    ).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from video 30 min/day template' }),
    ).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from work hours focus template' }),
    ).not.toBeVisible()
  })

  test('無効な正規表現はエラー表示され、保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('[invalid')
    await page.getByLabel('Name').fill('Bad')

    await expect(page.getByText('Invalid URL pattern')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // 無効なパターン文字列は保存されていない
    await expect(page.getByText('[invalid')).not.toBeVisible()
  })

  test('スケジュールルールの時間帯と上限分数を編集して永続化される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LimitedSite')
    await page.getByRole('button', { name: 'Add time window' }).click()
    await page.getByLabel('Time window type').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('09:15-10:45, 22:00-01:30')
    await page.getByRole('button', { name: 'Add restriction' }).click()
    await page.getByLabel('Restriction type').last().selectOption('grace')
    await page.getByLabel('Grace minutes per day').fill('30')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Time window 1')).toContainText('Every day')
    await expect(page.getByLabel('Time window 1')).toContainText('09:15-10:45, 22:00-01:30')
    await expect(page.getByLabel('Restriction 1')).toContainText('30 min/day')
  })

  test('スケジュールルールが時間帯も上限もないと保存できない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('EmptyRule')
    await page.getByRole('button', { name: 'Add restriction' }).click()
    await page.getByLabel('Restriction type').last().selectOption('grace')
    await page.getByLabel('Grace minutes per day').fill('30')
    await page.getByLabel('Grace minutes per day').fill('')

    await expect(page.getByText('Use 0+ integer')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled()
  })

  test('今日有効な上限がある場合に残り時間を表示する', async ({ page, context, extensionId }) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
            local: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://example.com',
          dailyResetHour: '00:00',
        },
        groups: [
          {
            id: 'limited',
            name: 'Limited',
            mode: 'blacklist',
            patterns: ['example\\.com'],
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 30,
            })),
          },
        ],
      })
    })
    await page.waitForTimeout(500)
    await serviceWorker.evaluate(async () => {
      const date = new Date()
      const logicalDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')
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
          limited: {
            logicalDate,
            consumedSec: 25 * 60,
          },
        },
      })
    })

    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByLabel('Remaining time today summary')).toContainText('Daily limit')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('5:00 left')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('25:00 / 30:00')
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute(
      'aria-valuenow',
      String(25 * 60),
    )
  })

  test('カウンタ更新時に残り時間を更新する', async ({ page, context, extensionId }) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
            local: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://example.com',
          dailyResetHour: '00:00',
        },
        groups: [
          {
            id: 'limited',
            name: 'Limited',
            mode: 'blacklist',
            patterns: ['example\\.com'],
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 30,
            })),
          },
        ],
      })
    })
    await page.waitForTimeout(500)
    await serviceWorker.evaluate(async () => {
      const date = new Date()
      const logicalDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')
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
          limited: {
            logicalDate,
            consumedSec: 25 * 60,
          },
        },
      })
    })

    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await expect(page.getByLabel('Remaining time today summary')).toContainText('5:00 left')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('25:00 / 30:00')

    await page.evaluate(async () => {
      const date = new Date()
      const logicalDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')
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
          limited: {
            logicalDate,
            consumedSec: 28 * 60,
          },
        },
      })
    })

    await expect(page.getByLabel('Remaining time today summary')).toContainText('2:00 left')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('28:00 / 30:00')
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute(
      'aria-valuenow',
      String(28 * 60),
    )
  })

  test('ブロック時間帯を日跨ぎで追加して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('NightBlock')
    await page.getByRole('button', { name: 'Add time window' }).click()
    await page.getByLabel('Time window type').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('22:00-06:00')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Time window 1')).toContainText('22:00-06:00')
  })

  test('曜日指定の上限ルールを個別に永続化できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('CustomDays')
    await page.getByRole('button', { name: 'Add time window' }).click()
    const timeWindowType = page.getByLabel('Time window type')
    await expect(timeWindowType.locator('option')).toHaveText([
      'Always',
      'Every day',
      'Weekly',
      'Monthly',
      'Period',
    ])
    await expect(page.getByRole('heading', { name: /Time window 1|Restriction 1/ })).toHaveCount(0)
    await timeWindowType.selectOption('weekly')
    await page.getByRole('checkbox', { name: 'Monday' }).check()
    await page.getByRole('button', { name: 'Add restriction' }).click()
    await page.getByLabel('Restriction type').last().selectOption('grace')
    await page.getByLabel('Grace minutes per day').fill('60')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Time window 1')).toContainText('Weekly Mon')
    await expect(page.getByLabel('Restriction 1')).toContainText('60 min/day')
  })

  test('グループを削除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ToDelete')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Delete group' }).click()
    await expectDialogCentered(page, page.locator('dialog').filter({ hasText: 'Delete group?' }))
    await page.getByRole('button', { name: 'Confirm delete' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
  })

  test('保存済みグループのアクションメニューは Edit ボタンの右に配置される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LeftDelete')
    await page.getByRole('button', { name: 'Save group' }).click()

    const editBox = await page.getByRole('button', { name: 'Edit group' }).boundingBox()
    const actionsBox = await page.getByRole('button', { name: 'Group actions' }).boundingBox()

    expect(editBox).not.toBeNull()
    expect(actionsBox).not.toBeNull()
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).not.toBeVisible()
    expect(editBox!.x + editBox!.width).toBeLessThanOrEqual(actionsBox!.x)
    expect(Math.abs(editBox!.y - actionsBox!.y)).toBeLessThan(4)

    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).toBeVisible()
  })

  test('Redirect 制限の遷移先 URL を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('RedirectGroup')
    await page.getByRole('button', { name: 'Add restriction' }).last().click()
    await page.getByLabel('Restriction type').last().selectOption('redirect')
    await page.getByLabel('Redirect URL').fill('https://blocked.example.test')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Restriction 1').first()).toContainText(
      'Redirect to https://blocked.example.test',
    )
    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByLabel('Redirect URL')).toHaveValue('https://blocked.example.test')
  })

  test('Redirect 制限の URL が不正なら保存できない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('InvalidRedirectGroup')
    await page.getByRole('button', { name: 'Add restriction' }).last().click()
    await page.getByLabel('Restriction type').last().selectOption('redirect')
    await page.getByLabel('Redirect URL').fill('not-a-url')

    await expect(page.getByText('Invalid URL')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled()
  })

  test('保存済みグループの閲覧時はフォーム部品が操作可能に見えない', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyVisuals')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByRole('button', { name: 'Add time window' }).click()
    await page.getByLabel('Time window type').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('09:00-17:00')
    await page.getByRole('button', { name: 'Add restriction' }).click()
    await page.getByLabel('Restriction type').last().selectOption('grace')
    await page.getByLabel('Grace minutes per day').fill('45')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()

    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
    await expect(urlPatternsSection.getByText('example\\.com', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Time window 1')).toContainText('09:00-17:00')
    await expect(page.getByLabel('Restriction 1')).toContainText('45 min/day')
    await expect(page.getByLabel('Active time ranges')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add restriction' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Add time window' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
  })

  test('保存済みグループの閲覧時はスケジュールルールが読み取り専用で表示される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyRules')
    await page.getByRole('button', { name: 'Add time window' }).click()
    await page.getByLabel('Time window type').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('09:00-17:00')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    const timeWindow = page.getByLabel('Time window 1')
    await expect(timeWindow).toContainText('09:00-17:00')
    await expect(page.getByLabel('Active time ranges')).toHaveCount(0)
    const [cardBox, valueBox] = await Promise.all([
      timeWindow.locator('..').boundingBox(),
      timeWindow.boundingBox(),
    ])
    expect(valueBox!.y - cardBox!.y).toBeLessThan(16)

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByLabel('Active time ranges')).toHaveValue('09:00-17:00')
  })
})
