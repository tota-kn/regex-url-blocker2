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
    await page.getByRole('button', { name: '+ 上限追加' }).click()
    await page.getByLabel('上限分数').fill('30')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('上限分数')).toHaveValue('30')
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

    await expect(page.getByLabel('今日の残り時間')).toHaveText('残り 5 分 / 上限 30 分')
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
    await expect(page.getByLabel('今日の残り時間')).toHaveText('残り 5 分 / 上限 30 分')

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

    await expect(page.getByLabel('今日の残り時間')).toHaveText('残り 2 分 / 上限 30 分')
  })

  test('ブロック時間帯を日跨ぎで追加して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByLabel('名前').fill('NightBlock')
    await page.getByRole('button', { name: '+ ブロック時間帯追加' }).click()
    await page.getByLabel('開始時刻').fill('22:00')
    await page.getByLabel('終了時刻').fill('06:00')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('開始時刻')).toHaveValue('22:00')
    await expect(page.getByLabel('終了時刻')).toHaveValue('06:00')
  })

  test('上限に曜日を選んで永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByLabel('名前').fill('WeekdayOnly')
    await page.getByRole('button', { name: '+ 上限追加' }).click()
    await page.getByRole('checkbox', { name: '月' }).check()
    await page.getByRole('checkbox', { name: '火' }).check()
    await page.getByLabel('上限分数').fill('60')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByRole('checkbox', { name: '月' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: '火' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: '水' })).not.toBeChecked()
    await expect(page.getByLabel('上限分数')).toHaveValue('60')
  })

  test('グループを削除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByLabel('名前').fill('ToDelete')

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await page.getByRole('button', { name: 'グループを削除' }).click()
    await page.getByRole('button', { name: '削除する' }).click()

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

  test('モード切替（ホワイトリスト）が永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: '+ グループを追加' }).click()
    await page.getByLabel('名前').fill('AllowOnly')

    // デフォルトはブラックリスト
    await expect(page.getByRole('button', { name: 'ブラックリスト' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'ホワイトリスト' })).toHaveAttribute('aria-pressed', 'false')

    // ホワイトリストに切替
    await page.getByRole('button', { name: 'ホワイトリスト' }).click()
    await expect(page.getByRole('button', { name: 'ホワイトリスト' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('マッチしないURLをブロックします')).toBeVisible()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // リロード後も保持
    await expect(page.getByRole('button', { name: 'ホワイトリスト' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'ブラックリスト' })).toHaveAttribute('aria-pressed', 'false')
  })
})
