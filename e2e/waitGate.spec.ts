import type { Worker } from '@playwright/test'
import { expect, test } from './fixtures'
import { gotoAndWaitForUrl, startTestServer, waitForEffectiveSettings } from './helpers'

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
      await globalThis.chrome.storage.sync.set({
        global: { dailyResetHour: '00:00' },
        groups: [
          {
            id: 'wait-local',
            name: 'Wait local',
            disabled: false,
            lockMode: false,
            patterns: [`^${settings.origin.replaceAll('.', '\\.')}`],
            pauseAllowed: true,
            rules: [
              {
                id: 'wait-rule',
                window: { type: 'always' },
                restriction: {
                  kind: 'wait',
                  seconds: settings.delaySeconds,
                  grantMinutes: settings.grantMinutes,
                },
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
    serviceWorker,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      await page.clock.install()
      await saveWaitGateSettings(serviceWorker, server.origin, 60)
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/wait\\.html`),
      )
      const urlLabel = await page.getByRole('heading', { name: 'URL', exact: true }).boundingBox()
      const urlValue = await page.getByLabel('Waiting URL').boundingBox()
      expect(urlValue!.y - (urlLabel!.y + urlLabel!.height)).toBeLessThanOrEqual(8)
      await expect(page.getByRole('progressbar')).toHaveCount(0)
      await expect(page.getByLabel('Wait countdown')).toHaveCount(0)
      await expect(page.getByLabel('Wait grant explanation')).toHaveCount(0)
      await expect(page.getByText(/This page is gated by/)).toHaveCount(0)

      const continueButton = page.getByRole('button', { name: 'Continue' })
      await expect(continueButton).toBeDisabled()
      await expect(continueButton).toHaveText('Continue(60)')
      await page.clock.fastForward(1_000)
      await expect(continueButton).toHaveText('Continue(59)')
      await expect(continueButton).toBeDisabled()
      await page.clock.fastForward(59_100)
      await expect(continueButton).toHaveText('Continue')
      await expect(continueButton).toBeEnabled()

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
    serviceWorker,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      await saveWaitGateSettings(serviceWorker, server.origin, 30)
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/wait\\.html`),
      )

      // カウントダウン未完了の Continue は無効なまま
      await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()

      // 直接遷移し直しても待機ページへ戻される
      await gotoAndWaitForUrl(
        page,
        `${server.origin}/target`,
        new RegExp(`^chrome-extension://${extensionId}/wait\\.html`),
      )
    } finally {
      await server.close()
    }
  })

  test('通過後の許可期間が切れると再び待機ページになる', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    const server = await startTestServer()
    try {
      await page.clock.install()
      // 許可期間を 1 分にして、期限切れを storage 側で早送りする。
      await saveWaitGateSettings(serviceWorker, server.origin, 1, 1)
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/gated`,
        new RegExp(`^chrome-extension://${extensionId}/wait\\.html`),
      )

      const continueButton = page.getByRole('button', { name: 'Continue' })
      await page.clock.fastForward(1_100)
      await expect(continueButton).toBeEnabled()
      await continueButton.click()
      await expect(page).toHaveURL(`${server.origin}/gated`)

      // 許可期間中は待機ページへ戻らない。
      await gotoAndWaitForUrl(page, `${server.origin}/gated`, `${server.origin}/gated`)

      // 許可期間を過去にすると、次のアクセスで再び待機ページになる。
      await serviceWorker.evaluate(async () => {
        await globalThis.chrome.storage.local.set({
          delayGrantState: { 'wait-local': { grantedUntil: Date.now() - 1_000 } },
        })
      })

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/gated`,
        new RegExp(`^chrome-extension://${extensionId}/wait\\.html`),
      )
    } finally {
      await server.close()
    }
  })

  test('Pause 中は待機ページを出さず素通しする', async ({ page, serviceWorker, extensionId }) => {
    const server = await startTestServer()
    try {
      await saveWaitGateSettings(serviceWorker, server.origin, 30)
      await waitForEffectiveSettings(serviceWorker)

      await gotoAndWaitForUrl(
        page,
        `${server.origin}/gated`,
        new RegExp(`^chrome-extension://${extensionId}/wait\\.html`),
      )

      await serviceWorker.evaluate(async () => {
        await globalThis.chrome.storage.local.set({
          groupPauseState: { 'wait-local': { pausedUntil: Date.now() + 5 * 60_000 } },
        })
      })

      // Pause は Block だけでなく待機ゲートも解除する。
      await gotoAndWaitForUrl(page, `${server.origin}/gated`, `${server.origin}/gated`)
    } finally {
      await server.close()
    }
  })
})
