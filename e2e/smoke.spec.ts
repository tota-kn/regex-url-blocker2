import { test, expect } from './fixtures'

test('Options ページが開いて見出しが表示される', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByRole('heading', { name: 'URL ブロッカー設定' })).toBeVisible()
})

test('Popup ページが開いて見出しが表示される', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByRole('heading', { name: 'aaaHello World' })).toBeVisible()
})

test('Options ページで Tailwind CSS が適用されている', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  const el = page.getByTestId('tailwind-test')
  await expect(el).toBeVisible()
  // Tailwind 4 uses oklch color space; text-blue-600 = oklch(0.546 0.245 262.881), font-bold = 700
  await expect(el).toHaveCSS('color', 'oklch(0.546 0.245 262.881)')
  await expect(el).toHaveCSS('font-weight', '700')
})
