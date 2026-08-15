import { expect, test } from './fixtures'
import { openGeneralSettings } from './optionsPage'

test.describe('Options generalSettings', () => {
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
    await expect(page.getByLabel('Rule 1 destination URL')).not.toBeVisible()
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
    await expect(page.getByLabel('Rule 1 destination URL')).not.toBeVisible()
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

  test('General settings の入力エラーを別セクションでもナビに表示する', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    const thresholdInput = page.getByLabel('Minutes before daily limit warning', { exact: true })
    await thresholdInput.fill('')
    await expect(page.getByText('Enter a whole number of 1 or greater')).toBeVisible()

    await page.getByRole('button', { name: 'Groups' }).click()
    const errorIcon = page
      .getByRole('button', { name: 'General settings', exact: true })
      .locator('svg.text-danger')
    await expect(errorIcon).toBeVisible()

    await openGeneralSettings(page)
    await thresholdInput.fill('5')
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(errorIcon).toHaveCount(0)
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
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      await globalThis.chrome.storage.sync.set({
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
})
