import { expect, test } from './fixtures'

const DEBOUNCE_FLUSH_MS = 400

test.describe('Options 画面', () => {
  test('デフォルト値が表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByLabel('Redirect URL')).toHaveValue('https://example.com')
    await expect(page.getByRole('button', { name: 'Redirect' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Extension page' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByLabel('Reset time')).toHaveValue('00:00')
    await expect(page.getByLabel('No groups')).toHaveText('Empty')
  })

  test('グループ追加時に名前がデフォルトで「グループ1」になる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('Group 1')

    await page.getByRole('button', { name: 'Add group' }).click()
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Group 2')
  })

  test('パターン追加時にデフォルトで「https?://」が入力される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Add pattern' }).click()
    await expect(page.getByLabel('Regex')).toHaveValue('https?://')
  })

  test('グループを追加して保存→リロード後も保持される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('Twitter')
    await page.getByRole('button', { name: 'Add pattern' }).click()
    await page.getByLabel('Regex').fill('^https?://(www\\.)?twitter\\.com')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Twitter')
    await expect(page.getByLabel('Regex')).toHaveValue('^https?://(www\\.)?twitter\\.com')
  })

  test('無効な正規表現はエラー表示され、保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Add pattern' }).click()
    await page.getByLabel('Regex').fill('[invalid')
    await page.getByLabel('Name').fill('Bad')

    await expect(page.getByText('Invalid regex')).toBeVisible()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // 無効なパターン文字列は保存されていない
    await expect(page.getByText('[invalid')).not.toBeVisible()
  })

  test('上限分数を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('LimitedSite')
    await page.getByRole('button', { name: 'Add limit' }).click()
    await page.getByLabel('Limit minutes').fill('30')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Limit minutes')).toHaveValue('30')
  })

  test('今日有効な上限がある場合に残り時間を表示する', async ({ page, context, extensionId }) => {
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
            local: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://example.com',
          dailyResetHour: '00:00',
        },
        groups: [{
          id: 'limited',
          name: 'Limited',
          mode: 'blacklist',
          patterns: ['example\\.com'],
          blockedTimeSlots: [],
          timeLimits: [{ daysOfWeek: [], dailyMinutes: 30 }],
        }],
      })
    })
    await page.waitForTimeout(500)
    await serviceWorker.evaluate(async () => {
      const date = new Date()
      const logicalDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
          }
        }
      }
      await chromeApi.chrome.storage.local.set({
        counters: {
          limited: {
            logicalDate,
            consumedSec: 25 * 60,
          },
        },
      })
    })

    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByLabel('Remaining time today')).toHaveText('5:00 / 30:00')
  })

  test('カウンタ更新時に残り時間を更新する', async ({ page, context, extensionId }) => {
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
            local: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://example.com',
          dailyResetHour: '00:00',
        },
        groups: [{
          id: 'limited',
          name: 'Limited',
          mode: 'blacklist',
          patterns: ['example\\.com'],
          blockedTimeSlots: [],
          timeLimits: [{ daysOfWeek: [], dailyMinutes: 30 }],
        }],
      })
    })
    await page.waitForTimeout(500)
    await serviceWorker.evaluate(async () => {
      const date = new Date()
      const logicalDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
          }
        }
      }
      await chromeApi.chrome.storage.local.set({
        counters: {
          limited: {
            logicalDate,
            consumedSec: 25 * 60,
          },
        },
      })
    })

    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await expect(page.getByLabel('Remaining time today')).toHaveText('5:00 / 30:00')

    await page.evaluate(async () => {
      const date = new Date()
      const logicalDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
          }
        }
      }
      await chromeApi.chrome.storage.local.set({
        counters: {
          limited: {
            logicalDate,
            consumedSec: 28 * 60,
          },
        },
      })
    })

    await expect(page.getByLabel('Remaining time today')).toHaveText('2:00 / 30:00')
  })

  test('ブロック時間帯を日跨ぎで追加して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('NightBlock')
    await page.getByRole('button', { name: 'Add slot' }).click()
    await expect(page.getByRole('checkbox', { name: 'Sunday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked()
    await page.getByLabel('Start time').fill('22:00')
    await page.getByLabel('End time').fill('06:00')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Start time')).toHaveValue('22:00')
    await expect(page.getByLabel('End time')).toHaveValue('06:00')
  })

  test('上限の曜日を選択解除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('CustomDays')
    await page.getByRole('button', { name: 'Add limit' }).click()
    await expect(page.getByRole('checkbox', { name: 'Sunday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked()
    await page.getByRole('checkbox', { name: 'Wednesday' }).uncheck()
    await page.getByRole('checkbox', { name: 'Thursday' }).uncheck()
    await page.getByRole('checkbox', { name: 'Friday' }).uncheck()
    await page.getByLabel('Limit minutes').fill('60')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Tuesday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Wednesday' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Thursday' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Friday' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked()
    await expect(page.getByLabel('Limit minutes')).toHaveValue('60')
  })

  test('グループを削除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('ToDelete')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await page.getByRole('button', { name: 'Delete group' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('Empty')
  })

  test('redirectUrl を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByLabel('Redirect URL').fill('https://blocked.example.test')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Redirect URL')).toHaveValue('https://blocked.example.test')
  })

  test('ブロック時動作を拡張ページに切り替えて永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Extension page' }).click()
    await expect(page.getByRole('button', { name: 'Extension page' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByRole('button', { name: 'Extension page' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Redirect' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('モード切替（ホワイトリスト）が永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('AllowOnly')

    // デフォルトはブラックリスト
    await expect(page.getByRole('button', { name: 'Block' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Allow' })).toHaveAttribute('aria-pressed', 'false')

    // ホワイトリストに切替
    await page.getByRole('button', { name: 'Allow' }).click()
    await expect(page.getByRole('button', { name: 'Allow' })).toHaveAttribute('aria-pressed', 'true')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // リロード後も保持
    await expect(page.getByRole('button', { name: 'Allow' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Block' })).toHaveAttribute('aria-pressed', 'false')
  })
})
