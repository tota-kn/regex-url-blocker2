import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const DEBOUNCE_FLUSH_MS = 400

/**
 * Playwright の file input に渡す JSON ファイル指定を生成する。
 */
function jsonUploadFile(name: string, value: unknown): { name: string, mimeType: string, buffer: Buffer } {
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
  return [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
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
async function expectDialogCentered(page: Page, dialog: ReturnType<Page['locator']>): Promise<void> {
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
    await expect(page.getByRole('button', { name: 'Groups' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible()
    await expect(page.getByText('0 groups')).toBeVisible()
    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await expect(page.getByLabel('Start a new rule day at this time')).not.toBeVisible()
  })

  test('General settings を選ぶとグローバル設定と import/export controls が表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)

    await expect(page.getByRole('button', { name: /General settings/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'General settings' })).toBeVisible()
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('03:00')
    for (const title of ['Start a new rule day at this time', 'Notification', 'Allow this extension in Incognito', 'Settings file']) {
      await expect(page.locator('main').getByText(title, { exact: true }).first()).toHaveCSS('font-weight', '600')
    }
    await expect(page.locator('main span').filter({ hasText: 'Settings file' }).first().locator('svg')).toBeVisible()
    await expect(page.locator('main .border-t')).toHaveCount(0)
    const notification = page.getByLabel('Notification')
    await expect(notification).toBeVisible()
    await expect(notification.getByRole('checkbox', { name: 'Notify me when daily limit time is almost used up' })).toBeChecked()
    await expect(notification.getByLabel('Minutes left before warning', { exact: true })).toHaveValue('5')
    await expect(notification.getByLabel('Minutes left before warning', { exact: true })).toHaveAttribute('min', '1')
    await expect(notification.getByLabel('Notify me when I open a page with a daily limit')).toBeChecked()
    await expect(notification.getByLabel('Notify me when a redirect block happens')).toBeChecked()
    const incognitoMode = page.getByLabel('Allow this extension in Incognito')
    await expect(incognitoMode).toBeVisible()
    await expect(incognitoMode.getByText(/Incognito access:\s+(Enabled|Disabled|Unable to check)/)).toBeVisible()
    await expect(incognitoMode.getByRole('button', { name: 'Open Chrome extension settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import settings' })).toBeVisible()
    await expect(page.getByText('Import replaces all groups and general settings.')).toBeVisible()
  })

  test('Incognito mode の Chrome 拡張詳細ページを開ける', async ({ page, context, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    const pagePromise = context.waitForEvent('page')
    await page.getByRole('button', { name: 'Open Chrome extension settings' }).click()
    const extensionSettingsPage = await pagePromise

    await expect(extensionSettingsPage).toHaveURL(`chrome://extensions/?id=${extensionId}`)
  })

  test('セクション切り替え時にサイドバーの位置がずれない', async ({ page, context, extensionId }) => {
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
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
    await page.getByLabel('Minutes left before warning', { exact: true }).fill('12')
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()
    await openGeneralSettings(page)
    await expect(page.getByRole('checkbox', { name: 'Notify me when daily limit time is almost used up' })).toBeChecked()
    await expect(page.getByLabel('Minutes left before warning', { exact: true })).toHaveValue('12')

    await page.getByRole('checkbox', { name: 'Notify me when daily limit time is almost used up' }).uncheck()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()
    await openGeneralSettings(page)
    await expect(page.getByRole('checkbox', { name: 'Notify me when daily limit time is almost used up' })).not.toBeChecked()
    await expect(page.getByLabel('Minutes left before warning', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('Minutes left before warning', { exact: true })).toHaveValue('12')

    await page.getByRole('checkbox', { name: 'Notify me when daily limit time is almost used up' }).check()
    await expect(page.getByLabel('Minutes left before warning', { exact: true })).toBeEnabled()
    await expect(page.getByLabel('Minutes left before warning', { exact: true })).toHaveValue('12')

    await page.getByLabel('Minutes left before warning', { exact: true }).fill('0')
    await expect(page.getByText('Use 1+ integer')).toBeVisible()
  })

  test('通知タイミング設定を保存できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await page.getByLabel('Notify me when I open a page with a daily limit').uncheck()
    await page.getByLabel('Notify me when a redirect block happens').uncheck()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()
    await openGeneralSettings(page)

    await expect(page.getByLabel('Notify me when I open a page with a daily limit')).not.toBeChecked()
    await expect(page.getByLabel('Notify me when a redirect block happens')).not.toBeChecked()
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
    expect(exported.version).toBe(3)
    expect(exported.settings).toMatchObject({
      groups: [{ name: 'Exported', patterns: ['example\\.com'] }],
    })
  })

  test('設定ファイルをインポートすると既存設定が全置換される', async ({ page, context, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('BeforeImport')
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await openGeneralSettings(page)
    await page.getByLabel('Settings JSON file').setInputFiles(jsonUploadFile('settings.json', {
      version: 2,
      settings: {
        global: {
          blockAction: 'blockedPage',
          redirectUrl: 'https://blocked.test',
          dailyResetHour: '04:30',
          notificationThresholdMinutes: 9,
        },
        groups: [{
          id: 'imported-group',
          name: 'Imported',
          mode: 'blacklist',
          patterns: ['imported\\.example'],
          dailyRules: dailyRules({ dailyLimitMinutes: 15 }),
        }],
      },
    }))

    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('04:30')
    await expect(page.getByRole('checkbox', { name: 'Notify me when daily limit time is almost used up' })).toBeChecked()
    await expect(page.getByLabel('Minutes left before warning', { exact: true })).toHaveValue('9')
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('Imported')
    await expect(page.locator('main').getByText('Options')).not.toBeVisible()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveValue('imported\\.example')
    await expect(page.getByLabel('Sun daily limit minutes')).toHaveText('15')
    await expect(page.getByText('BeforeImport')).not.toBeVisible()

    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
    const stored = await serviceWorker.evaluate(async () => {
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
    }) as { global?: Record<string, unknown>, groups?: Array<Record<string, unknown>> }
    expect(stored.global?.dailyResetHour).toBe('04:30')
    expect(stored.global?.remainingTimeNotificationsEnabled).toBe(true)
    expect(stored.global?.notificationThresholdMinutes).toBe(9)
    expect(stored.groups).toHaveLength(1)
    expect(stored.groups?.[0].name).toBe('Imported')
  })

  test('保留中は希望設定を表示し、現在適用中の有効設定を確認できる', async ({ page, context, extensionId }) => {
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
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
        groups: [{
          id: 'work',
          name: 'Work',
          mode: 'blacklist',
          lockMode: true,
          patterns: ['active\\.example'],
          blockAction: 'redirect',
          redirectUrl: 'https://active-blocked.test',
          dailyRules: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
            dayOfWeek,
            blockedTimeRanges: [{ startMinute: 540, endMinute: 1020 }],
            dailyLimitMinutes: 10,
          })),
        }, {
          id: 'allowlist',
          name: 'Allowlist',
          mode: 'whitelist',
          lockMode: false,
          patterns: [],
          blockAction: 'blockedPage',
          redirectUrl: 'https://unused-blocked.test',
          dailyRules: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: undefined,
          })),
        }],
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
        groups: [{
          id: 'work',
          name: 'Work',
          mode: 'blacklist',
          lockMode: true,
          patterns: ['active\\.example'],
          blockAction: 'redirect',
          redirectUrl: 'https://preferred-blocked.test',
          dailyRules: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: 30,
          })),
        }, {
          id: 'allowlist',
          name: 'Allowlist',
          mode: 'whitelist',
          lockMode: false,
          patterns: [],
          blockAction: 'blockedPage',
          redirectUrl: 'https://unused-blocked.test',
          dailyRules: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: undefined,
          })),
        }],
      })
    })

    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('03:00')
    await expect(page.getByLabel('Start a new rule day at this time')).toBeDisabled()
    await expect(page.getByText('Cannot change while any group has Lock Mode enabled or pending.')).toBeVisible()
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Sun blocked time ranges').first()).toHaveText('No blocked hours')
    await expect(page.getByLabel('Sun daily limit minutes').first()).toHaveText('30')
    await expect(page.getByText('Some saved changes are not active yet.')).toBeVisible()
    await expect(page.getByText('Active until reset: 03:00')).toBeVisible()

    await page.getByRole('button', { name: 'View active settings' }).click()

    const activeSettingsDialog = page.locator('dialog').filter({ hasText: 'Currently active settings' })
    await expect(page.getByRole('heading', { name: 'Currently active settings' })).toBeVisible()
    await expectDialogCentered(page, activeSettingsDialog)
    await expect(activeSettingsDialog.getByText('General settings')).not.toBeVisible()
    await expect(activeSettingsDialog.getByText('Start a new rule day at this time')).not.toBeVisible()
    await expect(activeSettingsDialog.getByText('Notify me when daily limit time is almost used up')).not.toBeVisible()
    await expect(activeSettingsDialog.getByText('Notify me when I open a page with a daily limit')).not.toBeVisible()
    await expect(activeSettingsDialog.getByText('Notify me when a redirect block happens')).not.toBeVisible()
    await expect(activeSettingsDialog.getByText('URL patterns').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('Blocking rules').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('Options').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('URL pattern match behavior').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('Block matches')).toBeVisible()
    await expect(activeSettingsDialog.getByText('Allow only matches')).toBeVisible()
    await expect(activeSettingsDialog.getByText('Lock changes until next rule day').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('Page shown when blocked').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('Redirect to https://active-blocked.test')).toBeVisible()
    await expect(activeSettingsDialog.getByText('Blocked page')).toBeVisible()
    await expect(activeSettingsDialog.getByText('active\\.example')).toBeVisible()
    await expect(activeSettingsDialog.getByText('No URL patterns yet')).toBeVisible()
    await expect(activeSettingsDialog.getByText('Blocked hours: 09:00-17:00; Daily limit: 10 min/day').first()).toBeVisible()
    await expect(activeSettingsDialog.getByText('Blocked hours: No blocked hours; Daily limit: No daily limit').first()).toBeVisible()
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

  test('グループ作成ダイアログをキャンセルすると新規カードを作らない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await expect(page.getByRole('button', { name: 'Create blank group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create group from core SNS 15 min/day template' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create group from video 30 min/day template' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create group from work hours focus template' })).toBeVisible()
    await expect(page.getByText('30 min/day', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Block nights', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Allow nights', { exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Cancel create group' }).click()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    await expect(page.getByText('New group')).not.toBeVisible()
  })

  test('Core SNS 15 min/day テンプレートからSNSパターンと全曜日15分上限のグループを作成できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Create group from core SNS 15 min/day template' }).click()

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

    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      await expect(page.getByLabel(`${day} daily limit minutes`)).toHaveValue('15')
    }
  })

  test('Video 30 min/day テンプレートから動画パターンと全曜日30分上限のグループを作成できる', async ({ page, extensionId }) => {
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

    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      await expect(page.getByLabel(`${day} daily limit minutes`)).toHaveValue('30')
    }
  })

  test('Work hours focus テンプレートから平日日中ブロックのグループを作成できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Create group from work hours focus template' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()

    for (const day of ['Sun', 'Sat']) {
      await expect(page.getByLabel(`${day} blocked time ranges`)).toHaveText('No blocked hours')
    }
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      await expect(page.getByLabel(`${day} blocked time ranges`)).toHaveText('09:00-18:00')
    }
  })

  test('Options disclosure で group ごとの動作を操作できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Locked')
    const optionsButton = page.locator('main').getByRole('button', { name: 'Options' }).last()
    await expect(optionsButton).toBeVisible()
    await expect(optionsButton).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Block matches' })).not.toBeVisible()
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Allow only matches' })).not.toBeVisible()
    await expect(page.getByRole('radio', { name: 'Lock changes until next rule day Off' })).not.toBeVisible()
    await expect(page.getByRole('radio', { name: 'Lock changes until next rule day On' })).not.toBeVisible()
    await expect(page.getByRole('radio', { name: 'Page shown when blocked Blocked page' })).not.toBeVisible()
    await expect(page.getByRole('radio', { name: 'Page shown when blocked Redirect' })).not.toBeVisible()
    const urlPatternsSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'URL patterns' }) }).last()
    await expect(urlPatternsSection).not.toContainText('Block matches')
    await expect(urlPatternsSection).not.toContainText('Allow only matches')

    await optionsButton.click()
    await expect(optionsButton).toHaveAttribute('aria-expanded', 'true')
    const optionsPanel = page.locator('main [id^="options-panel-"]').last()
    await expect(optionsPanel.getByRole('radio', { name: 'URL pattern match behavior Block matches' })).toBeChecked()
    await expect(optionsPanel.getByRole('radio', { name: 'URL pattern match behavior Allow only matches' })).not.toBeChecked()
    await expect(optionsPanel.getByRole('radio', { name: 'Lock changes until next rule day Off' })).toBeChecked()
    await expect(optionsPanel.getByRole('radio', { name: 'Lock changes until next rule day On' })).toBeVisible()
    await expect(optionsPanel.getByRole('radio', { name: 'Page shown when blocked Blocked page' })).toBeChecked()
    await expect(optionsPanel.getByRole('radio', { name: 'Page shown when blocked Redirect' })).toBeVisible()
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await optionsPanel.getByRole('radio', { name: 'Page shown when blocked Redirect' }).check()
    await expect(page.getByLabel('Redirect URL')).toBeVisible()
    await optionsPanel.getByRole('radio', { name: 'Page shown when blocked Blocked page' }).check()
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await optionsPanel.getByRole('radio', { name: 'Lock changes until next rule day On' }).check()
    await expect(optionsPanel.getByRole('radio', { name: 'Lock changes until next rule day On' })).toBeChecked()
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.locator('main').getByText('Options')).toBeVisible()
    await expect(page.locator('main').getByText('Lock changes until next rule day')).toBeVisible()
    await expect(page.locator('main').getByText('On', { exact: true })).toBeVisible()
    await expect(page.locator('main').getByText('Page shown when blocked', { exact: true })).not.toBeVisible()
    await expect(page.getByRole('radio', { name: 'Lock changes until next rule day On' })).not.toBeVisible()
    await page.getByRole('button', { name: 'Edit group' }).click()
    await openGroupOptions(page)
    await expect(page.getByRole('radio', { name: 'Lock changes until next rule day On' })).toBeChecked()
    await page.getByRole('radio', { name: 'Lock changes until next rule day Off' }).check()
    await expect(page.getByRole('radio', { name: 'Lock changes until next rule day Off' })).toBeChecked()
  })

  test('Lock Mode group がある間、rule day 開始時刻入力が無効化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LockedReset')
    await openGroupOptions(page)
    await page.getByRole('radio', { name: 'Lock changes until next rule day On' }).check()
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await openGeneralSettings(page)
    await expect(page.getByLabel('Start a new rule day at this time')).toBeDisabled()
    await expect(page.getByText('Cannot change while any group has Lock Mode enabled or pending.')).toBeVisible()
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
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveAttribute('placeholder', 'example.com or ^https?://')
    await expect(page.getByText('Invalid URL pattern')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Delete pattern' })).toBeVisible()
  })

  test('編集可能な入力欄は共通の field 色で表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('textbox', { name: 'URL pattern' }).blur()
    const groupInputs = [
      page.getByLabel('Name'),
      page.getByRole('textbox', { name: 'URL pattern' }),
      page.getByLabel('Sun blocked time ranges'),
      page.getByLabel('Sun daily limit minutes'),
    ]

    for (const input of groupInputs) {
      await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(input).toHaveCSS('border-top-color', 'rgb(209, 213, 219)')
    }

    await openGeneralSettings(page)
    const generalInputs = [
      page.getByLabel('Start a new rule day at this time'),
      page.getByLabel('Minutes left before warning', { exact: true }),
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
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('^https?://(www\\.)?twitter\\.com')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Twitter')
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveValue('^https?://(www\\.)?twitter\\.com')
    await expect(page.getByLabel('Name')).toBeDisabled()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).not.toBeVisible()
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

    await expect(page.getByLabel('Name')).toHaveValue('DomainBlock')
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveValue('example.com')
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
    await expect(page.getByRole('button', { name: 'Delete group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeVisible()
    await page.getByLabel('Name').fill('Unsaved')
    await page.getByRole('button', { name: 'Cancel group' }).click()
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Saved')
    await expect(page.getByText('Unsaved')).not.toBeVisible()
  })

  test('グループ名は編集モードでのみ編集でき、名前欄の編集アイコンは表示しない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyName')
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeDisabled()

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Create group from core SNS 15 min/day template' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Create group from video 30 min/day template' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Create group from work hours focus template' })).not.toBeVisible()
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

  test('曜日別の時間帯と上限分数を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LimitedSite')
    await page.getByLabel('Wed blocked time ranges').fill('09:15-10:45, 22:00-01:30')
    await page.getByLabel('Wed daily limit minutes').fill('30')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Wed blocked time ranges')).toHaveText('09:15-10:45, 22:00-01:30')
    await expect(page.getByLabel('Wed daily limit minutes')).toHaveText('30')
  })

  test('曜日別の上限分数を空欄に戻すと No daily limit になる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('NoLimitSite')
    await page.getByLabel('Wed daily limit minutes').fill('30')
    await page.getByLabel('Wed daily limit minutes').fill('')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Wed daily limit minutes')).toHaveText('No daily limit')
  })

  test('今日有効な上限がある場合に残り時間を表示する', async ({ page, context, extensionId }) => {
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
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
        groups: [{
          id: 'limited',
          name: 'Limited',
          mode: 'blacklist',
          patterns: ['example\\.com'],
          dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: 30,
          })),
        }],
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
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute('aria-valuenow', String(25 * 60))
  })

  test('カウンタ更新時に残り時間を更新する', async ({ page, context, extensionId }) => {
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
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
        groups: [{
          id: 'limited',
          name: 'Limited',
          mode: 'blacklist',
          patterns: ['example\\.com'],
          dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: 30,
          })),
        }],
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
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute('aria-valuenow', String(28 * 60))
  })

  test('ブロック時間帯を日跨ぎで追加して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('NightBlock')
    await page.getByLabel('Sun blocked time ranges').fill('22:00-06:00')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Sun blocked time ranges')).toHaveText('22:00-06:00')
  })

  test('曜日別上限を個別に永続化できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('CustomDays')
    await page.getByLabel('Mon daily limit minutes').fill('60')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Mon daily limit minutes')).toHaveText('60')
    await expect(page.getByLabel('Tue daily limit minutes')).toHaveText('No daily limit')
  })

  test('グループを削除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ToDelete')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await page.getByRole('button', { name: 'Delete group' }).click()
    await expectDialogCentered(page, page.locator('dialog').filter({ hasText: 'Delete group?' }))
    await page.getByRole('button', { name: 'Confirm delete' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
  })

  test('保存済みグループの削除ボタンは Edit ボタンの左に配置される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LeftDelete')
    await page.getByRole('button', { name: 'Save group' }).click()

    const deleteBox = await page.getByRole('button', { name: 'Delete group' }).boundingBox()
    const editBox = await page.getByRole('button', { name: 'Edit group' }).boundingBox()

    expect(deleteBox).not.toBeNull()
    expect(editBox).not.toBeNull()
    expect(deleteBox!.x + deleteBox!.width).toBeLessThanOrEqual(editBox!.x)
    expect(Math.abs(deleteBox!.y - editBox!.y)).toBeLessThan(4)
  })

  test('グループ別 redirectUrl を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('RedirectGroup')
    await openGroupOptions(page)
    await expect(page.getByRole('radio', { name: 'Page shown when blocked Redirect' })).toBeVisible()
    await page.getByRole('radio', { name: 'Page shown when blocked Redirect' }).check()
    await page.getByLabel('Redirect URL').fill('https://blocked.example.test')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.locator('main').getByText('Redirect to https://blocked.example.test')).toBeVisible()
    await page.getByRole('button', { name: 'Edit group' }).click()
    await openGroupOptions(page)
    await expect(page.getByLabel('Redirect URL')).toHaveValue('https://blocked.example.test')
  })

  test('グループ別ブロック時動作を拡張ページに切り替えて永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('BlockedPageGroup')
    await openGroupOptions(page)
    await expect(page.getByRole('radio', { name: 'Page shown when blocked Blocked page' })).toBeChecked()
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await page.getByRole('radio', { name: 'Page shown when blocked Redirect' }).check()
    await page.getByLabel('Redirect URL').fill('https://ignored.example.test')
    await page.getByRole('radio', { name: 'Page shown when blocked Blocked page' }).check()
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.locator('main').getByText('Options')).not.toBeVisible()
    await page.getByRole('button', { name: 'Edit group' }).click()
    await openGroupOptions(page)
    await expect(page.getByRole('radio', { name: 'Page shown when blocked Blocked page' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Page shown when blocked Redirect' })).not.toBeChecked()
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
  })

  test('グループ別 redirectUrl 検証エラー時は保存できない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('InvalidRedirectGroup')
    await expect(page.locator('main').getByText('Options')).toBeVisible()
    await openGroupOptions(page)
    await page.getByRole('radio', { name: 'Page shown when blocked Redirect' }).check()
    await page.getByLabel('Redirect URL').fill('not-a-url')

    await expect(page.getByText('Invalid URL')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled()
  })

  test('モード切替（ホワイトリスト）が永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('AllowOnly')
    await openGroupOptions(page)

    // デフォルトはブラックリスト
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Block matches' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Allow only matches' })).not.toBeChecked()

    // ホワイトリストに切替
    await page.getByRole('radio', { name: 'URL pattern match behavior Allow only matches' }).check()
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Allow only matches' })).toBeChecked()
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // リロード後も保持
    await expect(page.locator('main').getByText('URL pattern match behavior')).toBeVisible()
    await expect(page.locator('main').getByText('Allow only matches')).toBeVisible()
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Allow only matches' })).not.toBeVisible()
    await page.getByRole('button', { name: 'Edit group' }).click()
    await openGroupOptions(page)
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Allow only matches' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Block matches' })).not.toBeChecked()
  })

  test('保存済みグループの閲覧時はフォーム部品が操作可能に見えない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyVisuals')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByLabel('Sun blocked time ranges').fill('09:00-17:00')
    await page.getByLabel('Sun daily limit minutes').fill('45')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    const pattern = page.getByRole('textbox', { name: 'URL pattern' })
    const ranges = page.getByLabel('Sun blocked time ranges')
    const minutes = page.getByLabel('Sun daily limit minutes')
    const sundayCell = page.getByRole('button', { name: 'Sun 09:00-09:30' })

    await expect(pattern).toBeDisabled()
    await expect(ranges).toHaveText('09:00-17:00')
    await expect(minutes).toHaveText('45')
    await expect(sundayCell).toBeDisabled()
    await expect(page.getByRole('radio', { name: 'URL pattern match behavior Block matches' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()

    await expect(pattern).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(pattern).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
  })

  test('保存済みグループの閲覧時は時間帯グリッドのドラッグで変更されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyDrag')
    await page.getByLabel('Sun blocked time ranges').fill('09:00-17:00')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await page.getByRole('button', { name: 'Sun 18:00-18:30' }).dispatchEvent('pointerdown')
    await page.getByRole('button', { name: 'Sun 19:00-19:30' }).dispatchEvent('pointerenter')
    await page.getByRole('button', { name: 'Sun 19:00-19:30' }).dispatchEvent('pointerup')

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByLabel('Sun blocked time ranges')).toHaveValue('09:00-17:00')
  })
})
