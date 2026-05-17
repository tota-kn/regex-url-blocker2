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

test.describe('Options 画面', () => {
  test('初期表示は Groups で General settings は非表示', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByRole('heading', { name: 'Regex URL Blocker' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Groups' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible()
    await expect(page.getByText('0 groups')).toBeVisible()
    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()
    await expect(page.getByLabel('Daily reset time')).not.toBeVisible()
  })

  test('General settings を選ぶとグローバル設定と import/export controls が表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)

    await expect(page.getByRole('button', { name: /General settings/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'General settings' })).toBeVisible()
    await expect(page.getByLabel('Redirect URL')).toHaveValue('https://example.com')
    await expect(page.getByRole('button', { name: 'Redirect' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Blocked page' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByLabel('Daily reset time')).toHaveValue('00:00')
    await expect(page.getByLabel('Remaining time notification')).toHaveValue('5')
    await expect(page.getByRole('button', { name: 'Export settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import settings' })).toBeVisible()
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

    const sidebarHeading = page.getByRole('heading', { name: 'Regex URL Blocker' })
    const groupsBox = await sidebarHeading.boundingBox()
    expect(groupsBox).not.toBeNull()

    await openGeneralSettings(page)
    const generalBox = await sidebarHeading.boundingBox()
    expect(generalBox).not.toBeNull()

    expect(generalBox!.x).toBeCloseTo(groupsBox!.x, 1)
    expect(generalBox!.width).toBeCloseTo(groupsBox!.width, 1)
  })

  test('残り時間通知の分数設定を保存でき、0 も設定できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await page.getByLabel('Remaining time notification').fill('12')
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()
    await openGeneralSettings(page)
    await expect(page.getByLabel('Remaining time notification')).toHaveValue('12')

    await page.getByLabel('Remaining time notification').fill('0')
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()
    await openGeneralSettings(page)
    await expect(page.getByLabel('Remaining time notification')).toHaveValue('0')
  })

  test('設定を JSON ファイルとしてエクスポートできる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('Exported')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL regex pattern').fill('example\\.com')
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGeneralSettings(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export settings' }).click()
    const download = await downloadPromise
    const path = await download.path()

    expect(download.suggestedFilename()).toBe('regex-url-blocker-settings.json')
    expect(path).not.toBeNull()

    const exported = JSON.parse(await fs.readFile(path!, 'utf8')) as Record<string, unknown>
    expect(exported.version).toBe(2)
    expect(exported.settings).toMatchObject({
      groups: [{ name: 'Exported', patterns: ['example\\.com'] }],
    })
  })

  test('設定ファイルをインポートすると既存設定が全置換される', async ({ page, context, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
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

    await expect(page.getByRole('button', { name: 'Blocked page' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Daily reset time')).toHaveValue('04:30')
    await expect(page.getByLabel('Remaining time notification')).toHaveValue('9')
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('Imported')
    await expect(page.getByLabel('URL regex pattern')).toHaveValue('imported\\.example')
    await expect(page.getByLabel('Sun daily limit minutes')).toHaveValue('15')
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
          dailyRules: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
            dayOfWeek,
            blockedTimeRanges: [{ startMinute: 540, endMinute: 1020 }],
            dailyLimitMinutes: 10,
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
          dailyRules: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: 30,
          })),
        }],
      })
    })

    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await expect(page.getByLabel('Redirect URL')).toHaveValue('https://preferred-blocked.test')
    await expect(page.getByLabel('Daily reset time')).toHaveValue('03:00')
    await expect(page.getByLabel('Daily reset time')).toBeDisabled()
    await expect(page.getByText('Cannot change while any group has Lock Mode enabled or pending.')).toBeVisible()
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Sun blocked time ranges')).toHaveValue('')
    await expect(page.getByLabel('Sun daily limit minutes')).toHaveValue('30')
    await expect(page.getByText('Some saved changes are not active yet.')).toBeVisible()
    await expect(page.getByText('Active until reset: 03:00')).toBeVisible()

    await page.getByRole('button', { name: 'View active settings' }).click()

    const activeSettingsDialog = page.locator('dialog').filter({ hasText: 'Currently active settings' })
    await expect(page.getByRole('heading', { name: 'Currently active settings' })).toBeVisible()
    await expectDialogCentered(page, activeSettingsDialog)
    await expect(activeSettingsDialog.getByText('https://preferred-blocked.test')).toBeVisible()
    await expect(activeSettingsDialog.getByText('03:00', { exact: true })).toBeVisible()
    await expect(activeSettingsDialog.getByText('Lock Mode On')).toBeVisible()
    await expect(activeSettingsDialog.getByText('active\\.example')).toBeVisible()
    await expect(activeSettingsDialog.getByText('Blocked: 09:00-17:00; limit: 10 min').first()).toBeVisible()
  })

  test('不正な設定ファイルはインポートせず既存設定を残す', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
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
    await expect(page.getByLabel('Name')).toHaveValue('Group 1')
    await expect(page.getByLabel('Name')).toBeFocused()
    await expect(page.getByLabel('No groups')).not.toBeVisible()
    await expect(page.getByText('New group')).toBeVisible()

    await page.getByRole('button', { name: 'Add group' }).click()
    await expect(page.getByLabel('Name').first()).toHaveValue('Group 1')
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Group 2')
    await expect(page.getByLabel('Name').nth(1)).toBeFocused()
  })

  test('Options で group ごとの Lock Mode トグルを操作できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('Locked')
    await expect(page.getByLabel('Lock Mode')).not.toBeChecked()
    await page.getByLabel('Lock Mode').check()
    await expect(page.getByLabel('Lock Mode')).toBeChecked()
    await expect(page.getByText('Changes to this group apply after the next reset.')).toBeVisible()
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Lock Mode')).toBeChecked()
    await expect(page.getByLabel('Lock Mode')).toBeDisabled()
    await page.getByRole('button', { name: 'Edit group' }).click()
    await page.getByLabel('Lock Mode').uncheck()
    await expect(page.getByLabel('Lock Mode')).not.toBeChecked()
  })

  test('Lock Mode group がある間、Daily reset time 入力が無効化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('LockedReset')
    await page.getByLabel('Lock Mode').check()
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await openGeneralSettings(page)
    await expect(page.getByLabel('Daily reset time')).toBeDisabled()
    await expect(page.getByText('Cannot change while any group has Lock Mode enabled or pending.')).toBeVisible()
  })

  test('保存済みグループの下に新規ドラフトを追加する', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('Saved')
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await page.getByRole('button', { name: 'Add group' }).click()
    await expect(page.getByLabel('Name').first()).toHaveValue('Saved')
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Group 2')
    await expect(page.getByLabel('Name').nth(1)).toBeFocused()
  })

  test('パターン追加時にデフォルトで「https?://」が入力される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await expect(page.getByLabel('URL regex pattern')).toHaveValue('https?://')
    await expect(page.getByRole('button', { name: 'Delete pattern' })).toBeVisible()
  })

  test('編集可能な入力欄は共通の field 色で表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    const groupInputs = [
      page.getByLabel('Name'),
      page.getByLabel('URL regex pattern'),
      page.getByLabel('Sun blocked time ranges'),
      page.getByLabel('Sun daily limit minutes'),
    ]

    for (const input of groupInputs) {
      await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(input).toHaveCSS('border-top-color', 'rgb(209, 213, 219)')
    }

    await openGeneralSettings(page)
    const generalInputs = [
      page.getByLabel('Redirect URL'),
      page.getByLabel('Daily reset time'),
      page.getByLabel('Remaining time notification'),
    ]

    for (const input of generalInputs) {
      await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(input).toHaveCSS('border-top-color', 'rgb(209, 213, 219)')
    }
  })

  test('グループを追加して保存→リロード後も保持される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('Twitter')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL regex pattern').fill('^https?://(www\\.)?twitter\\.com')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Twitter')
    await expect(page.getByLabel('URL regex pattern')).toHaveValue('^https?://(www\\.)?twitter\\.com')
    await expect(page.getByLabel('Name')).toBeDisabled()
    await expect(page.getByLabel('URL regex pattern')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).not.toBeVisible()
  })

  test('新規グループ作成をキャンセルすると保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('DraftOnly')
    await page.getByRole('button', { name: 'Cancel group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
  })

  test('既存グループ編集をキャンセルすると保存済み値へ戻る', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
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

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('ReadonlyName')
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeDisabled()

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeEnabled()
  })

  test('無効な正規表現はエラー表示され、保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL regex pattern').fill('[invalid')
    await page.getByLabel('Name').fill('Bad')

    await expect(page.getByText('Invalid regex')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // 無効なパターン文字列は保存されていない
    await expect(page.getByText('[invalid')).not.toBeVisible()
  })

  test('曜日別の時間帯と上限分数を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('LimitedSite')
    await page.getByLabel('Wed blocked time ranges').fill('09:15-10:45, 22:00-01:30')
    await page.getByLabel('Wed daily limit minutes').fill('30')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Wed blocked time ranges')).toHaveValue('09:15-10:45, 22:00-01:30')
    await expect(page.getByLabel('Wed daily limit minutes')).toHaveValue('30')
  })

  test('曜日別の上限分数を空欄に戻すと No limit になる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('NoLimitSite')
    await page.getByLabel('Wed daily limit minutes').fill('30')
    await page.getByLabel('Wed daily limit minutes').fill('')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Wed daily limit minutes')).toHaveValue('No limit')
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

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('NightBlock')
    await page.getByLabel('Sun blocked time ranges').fill('22:00-06:00')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Sun blocked time ranges')).toHaveValue('22:00-06:00')
  })

  test('曜日別上限を個別に永続化できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('CustomDays')
    await page.getByLabel('Mon daily limit minutes').fill('60')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Mon daily limit minutes')).toHaveValue('60')
    await expect(page.getByLabel('Tue daily limit minutes')).toHaveValue('No limit')
  })

  test('グループを削除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
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

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('LeftDelete')
    await page.getByRole('button', { name: 'Save group' }).click()

    const deleteBox = await page.getByRole('button', { name: 'Delete group' }).boundingBox()
    const editBox = await page.getByRole('button', { name: 'Edit group' }).boundingBox()

    expect(deleteBox).not.toBeNull()
    expect(editBox).not.toBeNull()
    expect(deleteBox!.x + deleteBox!.width).toBeLessThanOrEqual(editBox!.x)
    expect(Math.abs(deleteBox!.y - editBox!.y)).toBeLessThan(4)
  })

  test('redirectUrl を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await page.getByLabel('Redirect URL').fill('https://blocked.example.test')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await openGeneralSettings(page)
    await expect(page.getByLabel('Redirect URL')).toHaveValue('https://blocked.example.test')
  })

  test('ブロック時動作を拡張ページに切り替えて永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await page.getByRole('button', { name: 'Blocked page' }).click()
    await expect(page.getByRole('button', { name: 'Blocked page' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await openGeneralSettings(page)
    await expect(page.getByRole('button', { name: 'Blocked page' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Redirect' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('モード切替（ホワイトリスト）が永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('AllowOnly')

    // デフォルトはブラックリスト
    await expect(page.getByRole('button', { name: 'Block matches' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Allow only matches' })).toHaveAttribute('aria-pressed', 'false')

    // ホワイトリストに切替
    await page.getByRole('button', { name: 'Allow only matches' }).click()
    await expect(page.getByRole('button', { name: 'Allow only matches' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // リロード後も保持
    await expect(page.getByRole('button', { name: 'Allow only matches' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Allow only matches' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Block matches' })).not.toBeVisible()
  })

  test('保存済みグループの閲覧時はフォーム部品が操作可能に見えない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('ReadonlyVisuals')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL regex pattern').fill('example\\.com')
    await page.getByLabel('Sun blocked time ranges').fill('09:00-17:00')
    await page.getByLabel('Sun daily limit minutes').fill('45')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    const pattern = page.getByLabel('URL regex pattern')
    const ranges = page.getByLabel('Sun blocked time ranges')
    const minutes = page.getByLabel('Sun daily limit minutes')
    const sundayCell = page.getByRole('button', { name: 'Sun 09:00-09:30' })

    await expect(pattern).toBeDisabled()
    await expect(ranges).toBeDisabled()
    await expect(minutes).toBeDisabled()
    await expect(sundayCell).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Block matches' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()

    await expect(pattern).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(pattern).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
    await expect(ranges).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(minutes).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  })

  test('保存済みグループの閲覧時は時間帯グリッドのドラッグで変更されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
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
