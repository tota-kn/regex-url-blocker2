import { expect, test } from './fixtures'
import { setExtensionStorage } from './helpers'
import { expectGlobalSettingsStored, openGeneralSettings } from './optionsPage'
import { buildSettingsFixture } from './settingsFixture'

test.describe('Theme', () => {
  test('一般設定でテーマを即時に切り替え、再読み込み後も保持する', async ({
    page,
    extensionId,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await openGeneralSettings(page)

    const theme = page.getByLabel('Theme')
    await expect(theme).toHaveValue('auto')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'auto')

    await theme.selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(17, 24, 39)')
    await expectGlobalSettingsStored(page, { theme: 'dark' })

    await page.reload()
    await openGeneralSettings(page)
    await expect(page.getByLabel('Theme')).toHaveValue('dark')

    await page.getByLabel('Theme').selectOption('light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(249, 250, 251)')
  })

  test('自動テーマはブラウザの配色変更に追従する', async ({ page, extensionId }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(249, 250, 251)')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(17, 24, 39)')
  })

  test('ダークテーマをすべての拡張機能画面へ適用する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await setExtensionStorage(serviceWorker, 'sync', buildSettingsFixture([], { theme: 'dark' }))

    for (const path of ['options.html', 'popup.html', 'blocked.html', 'wait.html']) {
      await page.goto(`chrome-extension://${extensionId}/${path}`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(17, 24, 39)')
      await expect(page.locator('main')).toHaveCSS('color', 'rgb(243, 244, 246)')
    }
  })
})
