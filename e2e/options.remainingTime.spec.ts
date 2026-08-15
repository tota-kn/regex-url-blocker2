import { expect, test } from './fixtures'
import type { Worker } from '@playwright/test'
import { setExtensionStorage, waitForEffectiveSettings } from './helpers'
import { logicalDateId } from './logicalDate'
import {
  expectGlobalSettingsStored,
  expectVisibleGroupsStored,
  openGeneralSettings,
} from './optionsPage'
import { buildGroupFixture, buildSettingsFixture } from './settingsFixture'

/** 残り時間表示テスト用の現行スキーマ設定とカウンタを保存する。 */
async function seedRemainingTime(serviceWorker: Worker, consumedSec: number): Promise<void> {
  await setExtensionStorage(
    serviceWorker,
    'sync',
    buildSettingsFixture(
      [
        buildGroupFixture({
          id: 'limited',
          name: 'Limited',
          patterns: ['example\\.com'],
          rules: [
            {
              id: 'limited-rule',
              window: { type: 'always' },
              restriction: { kind: 'dailyLimit', minutes: 30 },
              destination: { type: 'redirect', url: 'https://example.com' },
            },
          ],
        }),
      ],
      { dailyResetHour: '00:00' },
    ),
  )
  await waitForEffectiveSettings(serviceWorker)
  await setExtensionStorage(serviceWorker, 'local', {
    counters: {
      limited: {
        logicalDate: logicalDateId(new Date(), '00:00'),
        consumedSec,
      },
    },
  })
}

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
    await seedRemainingTime(serviceWorker, 25 * 60)

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
    await seedRemainingTime(serviceWorker, 25 * 60)

    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await expect(page.getByLabel('Remaining time today summary')).toContainText('5:00 left')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('25:00 / 30:00')

    await setExtensionStorage(serviceWorker, 'local', {
      counters: {
        limited: {
          logicalDate: logicalDateId(new Date(), '00:00'),
          consumedSec: 28 * 60,
        },
      },
    })

    await expect(page.getByLabel('Remaining time today summary')).toContainText('2:00 left')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('28:00 / 30:00')
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute(
      'aria-valuenow',
      String(28 * 60),
    )
  })
})
