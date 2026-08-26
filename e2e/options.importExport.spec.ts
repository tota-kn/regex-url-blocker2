import fs from 'node:fs/promises'
import { expect, test } from './fixtures'
import { dailyRules, jsonUploadFile } from './optionsFixtures'
import { addRequiredGroupSections, createBlankGroup, openGeneralSettings } from './optionsPage'

test.describe('Options importExport', () => {
  test('設定を JSON ファイルとしてエクスポートできる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Exported')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGeneralSettings(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export settings' }).click()
    const download = await downloadPromise
    const path = await download.path()

    expect(download.suggestedFilename()).toBe('regex-url-guard-settings.json')
    expect(path).not.toBeNull()

    const exported = JSON.parse(await fs.readFile(path!, 'utf8')) as Record<string, unknown>
    expect(exported.version).toBe(15)
    expect(exported.settings).toMatchObject({
      groups: [{ name: 'Exported', patterns: ['example\\.com'] }],
    })
    expect(JSON.stringify(exported)).not.toContain('"mode"')
  })

  test('設定ファイルをインポートすると既存設定が全置換される', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('BeforeImport')
    await page.getByRole('button', { name: 'Save group' }).click()

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
    await expect(page.locator('main').getByRole('heading', { name: 'Options' })).toHaveCount(0)
    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    await expect(urlPatternsSection.getByText('imported\\.example', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
    await expect(page.getByLabel('Rule 1')).toContainText('Allow 15 min per day')
    await expect(page.getByText('BeforeImport')).not.toBeVisible()
    const stored = (await serviceWorker.evaluate(async () => {
      return globalThis.chrome.storage.sync.get(['global', 'groups'])
    })) as { global?: Record<string, unknown>; groups?: Array<Record<string, unknown>> }
    expect(stored.global?.dailyResetHour).toBe('04:30')
    expect(stored.global?.remainingTimeNotificationsEnabled).toBe(true)
    expect(stored.global?.notificationThresholdMinutes).toBe(9)
    expect(stored.groups).toHaveLength(1)
    expect(stored.groups?.[0].name).toBe('Imported')
  })

  test('旧 whitelist グループは無効化して mode なしでインポートする', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await openGeneralSettings(page)
    await page.getByLabel('Settings JSON file').setInputFiles(
      jsonUploadFile('legacy-whitelist.json', {
        version: 14,
        settings: {
          global: {},
          groups: [
            {
              id: 'legacy-whitelist',
              name: 'Legacy whitelist',
              mode: 'whitelist',
              disabled: false,
              patterns: ['allowed\\.example'],
              rules: [],
            },
          ],
        },
      }),
    )

    await expect
      .poll(async () => {
        const stored = (await serviceWorker.evaluate(async () => {
          return globalThis.chrome.storage.sync.get(['groups'])
        })) as { groups?: Array<Record<string, unknown>> }
        return stored.groups?.[0]?.name
      })
      .toBe('Legacy whitelist')
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('Legacy whitelist')
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible()

    const stored = (await serviceWorker.evaluate(async () => {
      return globalThis.chrome.storage.sync.get(['groups'])
    })) as { groups?: Array<Record<string, unknown>> }
    expect(stored.groups?.[0]?.disabled).toBe(true)
    expect(stored.groups?.[0]).not.toHaveProperty('mode')
  })

  test('不正な設定ファイルはインポートせず既存設定を残す', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('StillHere')
    await addRequiredGroupSections(page)
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGeneralSettings(page)
    await page.getByLabel('Settings JSON file').setInputFiles(jsonUploadFile('bad.json', '{'))

    await expect(page.getByText('Invalid JSON')).toBeVisible()
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('StillHere')
  })

  test('不正な設定ファイルのエラーを日本語で表示する', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await openGeneralSettings(page)
    await page.getByLabel('Language').selectOption('ja')

    await page.getByLabel('設定JSONファイル').setInputFiles(jsonUploadFile('bad.json', '{'))

    await expect(page.getByText('JSONが不正です')).toBeVisible()
  })
})
