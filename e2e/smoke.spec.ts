import { test, expect } from './fixtures'

test('Options ページが開いて見出しが表示される', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByRole('heading', { name: 'URL ブロッカー設定' })).toBeVisible()
})

test('Popup ページが開く', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByRole('heading', { name: 'URL ブロッカー' })).toBeVisible()
})
