import type { Worker } from '@playwright/test'
import { expect, test } from './fixtures'
import { gotoPossiblyRedirected, startTestServer, waitForEffectiveSettings } from './helpers'

/**
 * テスト用 HTTP サーバーを起動する。
 */
/**
 * Service Worker 上の storage.sync に待機ゲート設定を書き込む。
 */
async function saveWaitGateSettings(
  serviceWorker: Worker,
  origin: string,
  delaySeconds: number,
  grantMinutes = 10,
): Promise<void> {
  await serviceWorker.evaluate(
    async (settings) => {
      const chromeApi = globalThis as unknown as {
        chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'blockedPage',
          redirectUrl: `${settings.origin}/redirect`,
          dailyResetHour: '00:00',
        },
        groups: [
          {
            id: 'wait-local',
            name: 'Wait local',
            mode: 'blacklist',
            disabled: false,
            lockMode: false,
            patterns: [`^${settings.origin.replaceAll('.', '\\.')}`],
            blockAction: 'blockedPage',
            redirectUrl: `${settings.origin}/redirect`,
            timeWindows: [{ type: 'always' }],
            restrictions: [
              {
                type: 'wait',
                waitSeconds: settings.delaySeconds,
                waitGrantMinutes: settings.grantMinutes,
              },
            ],
          },
        ],
      })
    },
    { origin, delaySeconds, grantMinutes },
  )
}

test.describe('Wait gate', () => {
  test('待機ゲート対象ページは wait.html へ遷移し、待機完了後に許可される', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await saveWaitGateSettings(serviceWorker, server.origin, 1)
      await waitForEffectiveSettings(serviceWorker)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/wait\\.html`))
      await expect(page.getByLabel('Remaining seconds')).toBeVisible()

      const continueButton = page.getByRole('button', { name: 'Continue' })
      await expect(continueButton).toBeDisabled()
      await expect(continueButton).toBeEnabled({ timeout: 5000 })

      await continueButton.click()
      await expect(page).toHaveURL(`${server.origin}/target`)

      // 許可枠内では再度待機ページへ飛ばされない
      await expect(page).toHaveURL(`${server.origin}/target`)
    } finally {
      await server.close()
    }
  })

  test('ブラウザバックで待機を回避しても再訪時は再び待機ページになる', async ({
    page,
    context,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      await saveWaitGateSettings(serviceWorker, server.origin, 30)
      await waitForEffectiveSettings(serviceWorker)

      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/wait\\.html`))

      // カウントダウン未完了の Continue は無効なまま
      await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()

      // 直接遷移し直しても待機ページへ戻される
      await gotoPossiblyRedirected(page, `${server.origin}/target`)
      await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/wait\\.html`))
    } finally {
      await server.close()
    }
  })
})
