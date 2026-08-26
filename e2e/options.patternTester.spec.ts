import { expect, test } from './fixtures'
import { createBlankGroup, expectNoHorizontalOverflow } from './optionsPage'

test.describe('Options pattern tester', () => {
  test('編集中のパターンをモーダルでテストして修正を適用する', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL pattern', { exact: true }).fill('example.com')

    await page.getByRole('button', { name: 'Test pattern 1' }).click()
    const dialog = page.getByRole('dialog', { name: 'Test a URL pattern' })
    const pattern = dialog.getByLabel('Test URL pattern')
    const url = dialog.getByLabel('Test URL', { exact: true })

    await expect(dialog).toBeVisible()
    await expect(pattern).toHaveValue('example.com')
    await expect(url).toBeFocused()
    await expect(dialog.getByText('Domain', { exact: true })).toBeVisible()

    const patternBox = await pattern.boundingBox()
    const urlBox = await url.boundingBox()
    expect(patternBox!.y).toBeLessThan(urlBox!.y)
    expect(patternBox!.width).toBeCloseTo(urlBox!.width, 0)
    expect(dialog).toHaveCSS('width', '672px')

    await dialog.getByText('Regular expression quick reference').click()
    await expect(dialog.getByText('A literal period')).toBeVisible()

    await url.fill('https://news.example.com/article')
    await expect(dialog.getByRole('status')).toHaveText('Match')
    await url.fill('https://example.com.evil.test/')
    await expect(dialog.getByRole('status')).toHaveText('No match')

    await pattern.fill('^https?://(www\\.)?example\\.com/private')
    await expect(dialog.getByText('Regular expression', { exact: true })).toBeVisible()
    await url.fill('https://www.example.com/private/settings')
    await expect(dialog.getByRole('status')).toHaveText('Match')
    await dialog.getByRole('button', { name: 'Apply pattern' }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByLabel('URL pattern', { exact: true })).toHaveValue(
      '^https?://(www\\.)?example\\.com/private',
    )
  })

  test('不正なパターンを適用せず、キャンセル時は変更を破棄する', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL pattern', { exact: true }).fill('example.com')
    await page.getByRole('button', { name: 'Test pattern 1' }).click()

    const dialog = page.getByRole('dialog', { name: 'Test a URL pattern' })
    await dialog.getByLabel('Test URL pattern').fill('[invalid')
    await expect(dialog.getByText('Enter a valid URL pattern or regular expression.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Apply pattern' })).toBeDisabled()

    await dialog.getByRole('button', { name: 'Cancel pattern test' }).click()
    await expect(page.getByLabel('URL pattern', { exact: true })).toHaveValue('example.com')

    await page.getByRole('button', { name: 'Test pattern 1' }).click()
    await dialog.getByLabel('Test URL pattern').fill('changed.example.com')
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.getByLabel('URL pattern', { exact: true })).toHaveValue('example.com')
  })

  test('テストURLを毎回リセットし、閲覧時はテスト操作を隠す', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    const patterns = page.getByLabel('URL pattern', { exact: true })
    await patterns.nth(0).fill('example.com')
    await patterns.nth(1).fill('other.test')

    await page.getByRole('button', { name: 'Test pattern 1' }).click()
    const dialog = page.getByRole('dialog', { name: 'Test a URL pattern' })
    await dialog.getByLabel('Test URL', { exact: true }).fill('https://example.com/')
    await dialog.getByRole('button', { name: 'Apply pattern' }).click()

    await page.getByRole('button', { name: 'Test pattern 2' }).click()
    await expect(dialog.getByLabel('Test URL', { exact: true })).toHaveValue('')
    await expect(dialog.getByLabel('Test URL', { exact: true })).toBeFocused()
    await expect(dialog.getByRole('status')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Apply pattern' }).click()

    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByRole('button', { name: /Test pattern/ })).toHaveCount(0)
  })

  test('日本語と狭い画面でも編集フローを維持する', async ({ page, extensionId }) => {
    await page.setViewportSize({ width: 360, height: 700 })
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await page.getByRole('button', { name: 'General settings' }).click()
    await page.getByLabel('Language').selectOption('ja')
    await page.getByRole('button', { name: 'グループ', exact: true }).click()
    await page.getByRole('button', { name: 'グループを追加' }).click()
    await page.getByRole('button', { name: '空のグループを作成' }).click()
    await page.getByRole('button', { name: 'URLパターンを追加' }).click()

    const groupCard = page.locator('[data-new-group-card="true"]')
    await expectNoHorizontalOverflow(groupCard)
    await page.getByRole('button', { name: 'パターン1をテスト' }).click()
    const dialog = page.getByRole('dialog', { name: 'URLパターンをテスト' })
    await expect(dialog.getByLabel('テストするURLパターン')).toBeFocused()
    await expectNoHorizontalOverflow(dialog)
  })
})
