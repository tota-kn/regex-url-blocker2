import { expect, test } from './fixtures'

const DEBOUNCE_FLUSH_MS = 400

test.describe('Options 画面', () => {
  test('デフォルト値が表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByLabel('Redirect URL')).toHaveValue('https://example.com')
    await expect(page.getByRole('button', { name: 'Redirect' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Blocked page' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByLabel('Daily reset time')).toHaveValue('00:00')
    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
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
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await expect(page.getByLabel('URL regex pattern')).toHaveValue('https?://')
    await expect(page.getByRole('button', { name: 'Delete pattern' })).toBeVisible()
  })

  test('編集可能な入力欄は共通の field 色で表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('button', { name: 'Add blocked time' }).click()
    await page.getByRole('button', { name: 'Add daily limit' }).click()

    const editableInputs = [
      page.getByLabel('Redirect URL'),
      page.getByLabel('Daily reset time'),
      page.getByLabel('Name'),
      page.getByLabel('URL regex pattern'),
      page.getByLabel('Start time'),
      page.getByLabel('Minutes per day'),
    ]

    for (const input of editableInputs) {
      await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(input).toHaveCSS('border-top-color', 'rgb(209, 213, 219)')
    }
  })

  test('グループを追加して保存→リロード後も保持される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('Twitter')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL regex pattern').fill('^https?://(www\\.)?twitter\\.com')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Twitter')
    await expect(page.getByLabel('URL regex pattern')).toHaveValue('^https?://(www\\.)?twitter\\.com')
    await expect(page.getByLabel('Name')).toBeDisabled()
    await expect(page.getByLabel('URL regex pattern')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).not.toBeVisible()
  })

  test('新規グループ作成をキャンセルすると保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('DraftOnly')
    await page.getByRole('button', { name: 'Cancel group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
  })

  test('既存グループ編集をキャンセルすると保存済み値へ戻る', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('Saved')
    await page.getByRole('button', { name: 'Save group' }).click()
    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByRole('button', { name: 'Delete group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeVisible()
    await page.getByLabel('Name').fill('Unsaved')
    await page.getByRole('button', { name: 'Cancel group' }).click()
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Saved')
    await expect(page.getByText('Unsaved')).not.toBeVisible()
  })

  test('グループ名は編集モードでのみ編集でき、名前欄の編集アイコンは表示しない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('ReadonlyName')
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeDisabled()

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeEnabled()
  })

  test('無効な正規表現はエラー表示され、保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL regex pattern').fill('[invalid')
    await page.getByLabel('Name').fill('Bad')

    await expect(page.getByText('Invalid regex')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // 無効なパターン文字列は保存されていない
    await expect(page.getByText('[invalid')).not.toBeVisible()
  })

  test('上限分数を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('LimitedSite')
    await page.getByRole('button', { name: 'Add daily limit' }).click()
    await page.getByLabel('Minutes per day').fill('30')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Minutes per day')).toHaveValue('30')
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

    await expect(page.getByLabel('Remaining time today summary')).toContainText('Daily limit')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('5:00 left')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('25:00 / 30:00')
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute('aria-valuenow', String(25 * 60))
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
    await expect(page.getByLabel('Remaining time today summary')).toContainText('5:00 left')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('25:00 / 30:00')

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

    await expect(page.getByLabel('Remaining time today summary')).toContainText('2:00 left')
    await expect(page.getByLabel('Remaining time today summary')).toContainText('28:00 / 30:00')
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute('aria-valuenow', String(28 * 60))
  })

  test('ブロック時間帯を日跨ぎで追加して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('NightBlock')
    await page.getByRole('button', { name: 'Add blocked time' }).click()
    await expect(page.getByRole('checkbox', { name: 'Sunday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked()
    await page.getByLabel('Start time').fill('22:00')
    await page.getByLabel('End time').fill('06:00')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('Start time')).toHaveValue('22:00')
    await expect(page.getByLabel('End time')).toHaveValue('06:00')
  })

  test('上限の曜日を選択解除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('CustomDays')
    await page.getByRole('button', { name: 'Add daily limit' }).click()
    await expect(page.getByRole('checkbox', { name: 'Sunday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked()
    await page.getByRole('checkbox', { name: 'Wednesday' }).uncheck()
    await page.getByRole('checkbox', { name: 'Thursday' }).uncheck()
    await page.getByRole('checkbox', { name: 'Friday' }).uncheck()
    await page.getByLabel('Minutes per day').fill('60')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Tuesday' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Wednesday' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Thursday' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Friday' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked()
    await expect(page.getByLabel('Minutes per day')).toHaveValue('60')
  })

  test('グループを削除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('ToDelete')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)

    await page.getByRole('button', { name: 'Delete group' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
  })

  test('保存済みグループの削除ボタンは Edit ボタンの左に配置される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('LeftDelete')
    await page.getByRole('button', { name: 'Save group' }).click()

    const deleteBox = await page.getByRole('button', { name: 'Delete group' }).boundingBox()
    const editBox = await page.getByRole('button', { name: 'Edit group' }).boundingBox()

    expect(deleteBox).not.toBeNull()
    expect(editBox).not.toBeNull()
    expect(deleteBox!.x + deleteBox!.width).toBeLessThanOrEqual(editBox!.x)
    expect(Math.abs(deleteBox!.y - editBox!.y)).toBeLessThan(4)
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

    await page.getByRole('button', { name: 'Blocked page' }).click()
    await expect(page.getByRole('button', { name: 'Blocked page' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Redirect URL')).not.toBeVisible()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    await expect(page.getByRole('button', { name: 'Blocked page' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Redirect' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('モード切替（ホワイトリスト）が永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('AllowOnly')

    // デフォルトはブラックリスト
    await expect(page.getByRole('button', { name: 'Block matches' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Allow only matches' })).toHaveAttribute('aria-pressed', 'false')

    // ホワイトリストに切替
    await page.getByRole('button', { name: 'Allow only matches' }).click()
    await expect(page.getByRole('button', { name: 'Allow only matches' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    // リロード後も保持
    await expect(page.getByRole('button', { name: 'Allow only matches' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Allow only matches' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Block matches' })).not.toBeVisible()
  })

  test('保存済みグループの閲覧時はフォーム部品が操作可能に見えない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await page.getByLabel('Name').fill('ReadonlyVisuals')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByLabel('URL regex pattern').fill('example\\.com')
    await page.getByRole('button', { name: 'Add blocked time' }).click()
    await page.getByLabel('Start time').fill('09:00')
    await page.getByLabel('End time').fill('17:00')
    await page.getByRole('button', { name: 'Add daily limit' }).click()
    await page.getByLabel('Minutes per day').fill('45')
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.waitForTimeout(DEBOUNCE_FLUSH_MS)
    await page.reload()

    const pattern = page.getByLabel('URL regex pattern')
    const start = page.getByLabel('Start time')
    const minutes = page.getByLabel('Minutes per day')
    const sunday = page.getByRole('checkbox', { name: 'Sunday' }).first()

    await expect(pattern).toBeDisabled()
    await expect(start).toBeDisabled()
    await expect(minutes).toBeDisabled()
    await expect(sunday).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Block matches' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete blocked time' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete limit' })).not.toBeVisible()

    await expect(pattern).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(pattern).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
    await expect(start).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(minutes).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(sunday).toHaveClass(/sr-only/)
  })
})
