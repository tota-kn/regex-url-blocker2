import { expect, test } from './fixtures'

const DEBOUNCE_FLUSH_MS = 400

test.describe('Options 画面', () => {
  test('デフォルト値が表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByLabel('リダイレクト先 URL')).toHaveValue('https://example.com')
    await expect(page.getByLabel('リセット時刻')).toHaveValue('00:00')
    await expect(page.getByText('グループがありません')).toBeVisible()
  })

  test('グループ追加時に名前がデフォルトで「グループ1」になる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await expect(page.getByLabel('名前')).toHaveValue('グループ1')

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await expect(page.getByLabel('名前').nth(1)).toHaveValue('グループ2')
  })

  test('パターン追加時にデフォルトで「https?://」が入力される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByRole('button', { name: '+ パターン追加' }).click()
    await expect(page.getByLabel('正規表現')).toHaveValue('https?://')
  })

  test('グループを追加して保存→リロード後も保持される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByLabel('名前').fill('Twitter')
    await page.getByRole('button', { name: '+ パターン追加' }).click()
    await page.getByLabel('正規表現').fill('^https?://(www\\.)?twitter\\.com')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('名前')).toHaveValue('Twitter')
    await expect(page.getByLabel('正規表現')).toHaveValue('^https?://(www\\.)?twitter\\.com')
  })

  test('無効な正規表現はエラー表示され、保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByRole('button', { name: '+ パターン追加' }).click()
    await page.getByLabel('正規表現').fill('[invalid')
    await page.getByLabel('名前').fill('Bad')

    await expect(page.getByText('無効な正規表現です')).toBeVisible()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // 無効なパターン文字列は保存されていない
    await expect(page.getByText('[invalid')).not.toBeVisible()
  })

  test('上限分数を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByLabel('名前').fill('LimitedSite')
    await page.getByLabel('1日の上限（分）').fill('30')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('1日の上限（分）')).toHaveValue('30')
  })

  test('許可時間帯を日跨ぎで追加して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByLabel('名前').fill('NightOnly')
    await page.getByRole('button', { name: '+ 許可時間帯追加' }).click()
    await page.getByLabel('開始時刻').fill('22:00')
    await page.getByLabel('終了時刻').fill('06:00')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('開始時刻')).toHaveValue('22:00')
    await expect(page.getByLabel('終了時刻')).toHaveValue('06:00')
  })

  test('グループを削除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByLabel('名前').fill('ToDelete')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    page.on('dialog', d => d.accept())
    await page.getByRole('button', { name: 'グループを削除' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByText('グループがありません')).toBeVisible()
  })

  test('redirectUrl を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByLabel('リダイレクト先 URL').fill('https://blocked.example.test')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('リダイレクト先 URL')).toHaveValue('https://blocked.example.test')
  })
})
