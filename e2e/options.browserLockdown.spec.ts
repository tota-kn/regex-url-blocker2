import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'

test.describe('Options browserLockdown', () => {
  test('Windows を選ぶと拡張機能 ID 入りの reg コマンドを選択に合わせて表示する', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await page.getByRole('button', { name: 'Browser lockdown' }).click()

    await page.getByLabel('Operating system').selectOption('windows')
    await page.getByLabel('Browser', { exact: true }).selectOption('chrome')
    const commands = page.getByLabel('Commands to apply')
    await expect(commands).toContainText(`${extensionId};https://clients2.google.com`)
    await expect(commands).toContainText('IncognitoModeAvailability')
    await expect(commands).toContainText('BrowserGuestModeEnabled')
    await expect(page.getByLabel('Commands to undo')).toContainText('reg delete')

    await page.getByRole('checkbox', { name: 'Disable guest mode' }).uncheck()
    await expect(commands).not.toContainText('BrowserGuestModeEnabled')
  })

  test('macOS を選ぶと構成プロファイルをダウンロードできる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await page.getByRole('button', { name: 'Browser lockdown' }).click()

    await page.getByLabel('Operating system').selectOption('mac')
    await page.getByLabel('Browser', { exact: true }).selectOption('brave')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download profile' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('regex-url-guard-brave.mobileconfig')
    const xml = await readFile((await download.path())!, 'utf8')
    expect(xml).toContain('<string>com.brave.Browser</string>')
    expect(xml).toContain(extensionId)
  })
})
