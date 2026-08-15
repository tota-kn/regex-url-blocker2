import { expect, test } from './fixtures'
import { waitForEffectiveSettings } from './helpers'
import {
  expectGlobalSettingsStored,
  expectVisibleGroupsStored,
  openGeneralSettings,
} from './optionsPage'

test.describe('Options remainingTime', () => {
  test('残り時間通知の ON/OFF と分数設定を保存できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await page.getByLabel('Minutes before daily limit warning', { exact: true }).fill('12')
    await expectGlobalSettingsStored(page, { notificationThresholdMinutes: 12 })
    await expectVisibleGroupsStored(page)
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
    await expectGlobalSettingsStored(page, { remainingTimeNotificationsEnabled: false })
    await expectVisibleGroupsStored(page)
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
    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()
  })

  test('今日有効な上限がある場合に残り時間を表示する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      await globalThis.chrome.storage.sync.set({
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
    await waitForEffectiveSettings(serviceWorker)
    await serviceWorker.evaluate(async () => {
      const date = new Date()
      const logicalDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')

      await globalThis.chrome.storage.local.set({
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

  test('カウンタ更新時に残り時間を更新する', async ({ page, serviceWorker, extensionId }) => {
    await serviceWorker.evaluate(async () => {
      await globalThis.chrome.storage.sync.set({
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
    await waitForEffectiveSettings(serviceWorker)
    await serviceWorker.evaluate(async () => {
      const date = new Date()
      const logicalDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')

      await globalThis.chrome.storage.local.set({
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

      await globalThis.chrome.storage.local.set({
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
})
