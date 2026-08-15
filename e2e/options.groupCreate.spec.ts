import { expect, test } from './fixtures'
import { addRequiredGroupSections, createBlankGroup, expectDialogCentered } from './optionsPage'

test.describe('Options groupCreate', () => {
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

  test('Core social 15 min/day テンプレートからSNSパターンと全曜日15分上限のグループを作成できる', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page
      .getByRole('button', { name: 'Create group from core social 15 min/day template' })
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

    await expect(page.getByLabel('Rule 1 when')).toHaveValue('always')
    await expect(page.getByLabel('Rule 1 daily limit minutes')).toHaveValue('15')
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

    await expect(page.getByLabel('Rule 1 when')).toHaveValue('always')
    await expect(page.getByLabel('Rule 1 daily limit minutes')).toHaveValue('30')
  })

  test('Work hours focus テンプレートから平日日中ブロックのグループを作成できる', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Create group from work hours focus template' }).click()

    await expect(page.getByLabel('Rule 1 when')).toHaveValue('weekly')
    await expect(page.getByLabel('Active time ranges')).toHaveValue('09:00-18:00')
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      await expect(page.getByRole('checkbox', { name: day })).toBeChecked()
    }
    for (const day of ['Sunday', 'Saturday']) {
      await expect(page.getByRole('checkbox', { name: day })).not.toBeChecked()
    }

    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByLabel('Rule 1')).toContainText('Weekly Mon, Tue, Wed, Thu, Fri')
    await expect(page.getByLabel('Rule 1')).toContainText('09:00-18:00')
  })

  test('保存済みグループの下に新規ドラフトを追加する', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Saved')
    await addRequiredGroupSections(page)
    await page.getByRole('button', { name: 'Save group' }).click()

    await createBlankGroup(page)
    await expect(page.getByLabel('Name').first()).toHaveValue('Saved')
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Group 2')
    await expect(page.getByLabel('Name').nth(1)).toBeFocused()
  })
})
