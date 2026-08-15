import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { expect, test } from './fixtures'
import { setExtensionStorage, waitForEffectiveSettings } from './helpers'
import { logicalDateId } from './logicalDate'
import {
  addRequiredGroupSections,
  createBlankGroup,
  expectDialogCentered,
  expectGlobalSettingsStored,
  expectNoHorizontalOverflow,
  expectVisibleGroupsStored,
  openGeneralSettings,
  openGroupActions,
  openGroupOptions,
} from './optionsPage'

/**
 * Playwright の file input に渡す JSON ファイル指定を生成する。
 */
function jsonUploadFile(
  name: string,
  value: unknown,
): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  }
}

/**
 * E2E fixture 用の曜日別ルールを生成する。
 */
function dailyRules(override: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
    ...override,
  }))
}

/**
 * Lock Mode ON かつ Pause の待機 5 秒・停止 7 分のグループを、
 * 希望設定と当日の基準スナップショットの両方へ書き込む。Service Worker 内で実行する。
 */
async function seedLockedPauseGroup(
  serviceWorker: Parameters<typeof setExtensionStorage>[0],
): Promise<void> {
  const settings = {
    global: {
      dailyResetHour: '03:00',
      remainingTimeNotificationsEnabled: true,
      notificationThresholdMinutes: 5,
    },
    groups: [
      {
        id: 'locked-pause',
        name: 'Locked pause',
        mode: 'blacklist',
        disabled: false,
        lockMode: true,
        patterns: ['example\\.com'],
        pauseAllowed: true,
        pauseWaitSeconds: 5,
        pauseDurationMinutes: 7,
        rules: [
          {
            id: 'locked-pause-rule',
            window: { type: 'always' },
            restriction: { kind: 'block' },
            destination: { type: 'blockedPage' },
          },
        ],
      },
    ],
  }
  const logicalDate = logicalDateId(new Date(), '03:00')
  await setExtensionStorage(serviceWorker, 'local', {
    effectiveSettings: settings,
    effectiveSettingsLogicalDate: logicalDate,
  })
  await setExtensionStorage(serviceWorker, 'sync', settings)
}

/**
 * 希望設定からは削除済みだが、Lock Mode により当日の基準スナップショットには残っている
 * グループを書き込む。Service Worker 内で実行する。
 */
async function seedDeletedActiveGroup(
  serviceWorker: Parameters<typeof setExtensionStorage>[0],
): Promise<void> {
  const global = {
    dailyResetHour: '03:00',
    remainingTimeNotificationsEnabled: true,
    notificationThresholdMinutes: 5,
  }
  const deletedGroup = {
    id: 'deleted-active',
    name: 'Deleted active',
    mode: 'blacklist',
    disabled: false,
    lockMode: true,
    patterns: ['deleted\\.example'],
    pauseAllowed: true,
    rules: [
      {
        id: 'deleted-active-rule',
        window: { type: 'always' },
        restriction: { kind: 'block' },
        destination: { type: 'blockedPage' },
      },
    ],
  }
  const logicalDate = logicalDateId(new Date(), '03:00')
  await setExtensionStorage(serviceWorker, 'local', {
    effectiveSettings: { global, groups: [deletedGroup] },
    effectiveSettingsLogicalDate: logicalDate,
  })
  await setExtensionStorage(serviceWorker, 'sync', { global, groups: [] })
}

test.describe('Options 画面', () => {
  test('初期表示は Groups で General settings は非表示', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    const sidebarHeading = page.getByRole('heading', { name: 'Regex URL Guard' })
    await expect(sidebarHeading).toBeVisible()
    const sidebarHeadingHeight = await sidebarHeading.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        actual: element.getBoundingClientRect().height,
        singleLine: Number.parseFloat(style.lineHeight),
      }
    })
    expect(sidebarHeadingHeight.actual).toBeLessThanOrEqual(sidebarHeadingHeight.singleLine * 1.2)
    await expect(page.locator('aside h1 img[src$="/icon/32.png"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Groups' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible()
    await expect(page.getByText('0 groups')).toBeVisible()
    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    await expect(page.getByLabel('Rule 1 destination URL')).not.toBeVisible()
    await expect(page.getByLabel('Start a new rule day at this time')).not.toBeVisible()
  })

  test('General settings を選ぶとグローバル設定と import/export controls が表示される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)

    await expect(page.getByRole('button', { name: /General settings/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('heading', { name: 'General settings' })).toBeVisible()
    await expect(page.getByLabel('Rule 1 destination URL')).not.toBeVisible()
    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('03:00')
    for (const title of [
      'Start a new rule day at this time',
      'Notification',
      'Allow this extension in Incognito',
      'Settings file',
    ]) {
      await expect(page.locator('main').getByText(title, { exact: true }).first()).toHaveCSS(
        'font-weight',
        '600',
      )
    }
    await expect(
      page.locator('main span').filter({ hasText: 'Settings file' }).first().locator('svg'),
    ).toBeVisible()
    await expect(page.locator('main .border-t')).toHaveCount(0)
    const notification = page.getByLabel('Notification')
    await expect(notification).toBeVisible()
    await expect(
      notification.getByRole('checkbox', { name: 'Notify me before the daily limit is reached' }),
    ).toBeChecked()
    await expect(
      notification.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('5')
    await expect(
      notification.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveAttribute('min', '1')
    await expect(
      notification.getByLabel('Notify me when I open a page with a daily limit'),
    ).not.toBeVisible()
    await expect(
      notification.getByLabel('Notify me when a redirect block happens'),
    ).not.toBeVisible()
    const incognitoMode = page.getByLabel('Allow this extension in Incognito')
    await expect(incognitoMode).toBeVisible()
    await expect(
      incognitoMode.getByText(/Incognito access:\s+(Enabled|Disabled|Unable to check)/),
    ).toBeVisible()
    await expect(
      incognitoMode.getByRole('button', { name: 'Open Chrome extension settings' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import settings' })).toBeVisible()
    await expect(page.getByText('Import replaces all groups and general settings.')).toBeVisible()
  })

  test('General settings の入力エラーを別セクションでもナビに表示する', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    const thresholdInput = page.getByLabel('Minutes before daily limit warning', { exact: true })
    await thresholdInput.fill('')
    await expect(page.getByText('Enter a whole number of 1 or greater')).toBeVisible()

    await page.getByRole('button', { name: 'Groups' }).click()
    const errorIcon = page
      .getByRole('button', { name: 'General settings', exact: true })
      .locator('svg.text-danger')
    await expect(errorIcon).toBeVisible()

    await openGeneralSettings(page)
    await thresholdInput.fill('5')
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(errorIcon).toHaveCount(0)
  })

  test('グループ一時停止は設定した待機時間と継続時間を反映する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'blockedPage',
          redirectUrl: 'https://blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'pause-target',
            name: 'Pause target',
            mode: 'blacklist',
            lockMode: false,
            patterns: ['example\\.com'],
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            pauseWaitSeconds: 5,
            pauseDurationMinutes: 7,
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 0,
            })),
          },
        ],
      })
    })
    const startTime = new Date('2026-05-06T12:00:00+09:00')
    await page.clock.install({ time: startTime })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByText('Pause', { exact: true })).toBeVisible()
    await expect(page.getByText('Wait 5 sec, pause for 7 min')).toBeVisible()
    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    const pauseDialog = page.locator('dialog').filter({ hasText: 'Take a breath' })
    await expect(pauseDialog.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
    await expect(pauseDialog.getByText('5s remaining')).toBeVisible()
    await expect(pauseDialog.getByRole('button', { name: 'Pause 7 min' })).toBeDisabled()
    const editButtonBox = await page.getByRole('button', { name: 'Edit group' }).boundingBox()
    expect(editButtonBox).not.toBeNull()
    const elementAtEditButton = await page.evaluate(
      ({ x, y }) => {
        return document.elementFromPoint(x, y)?.closest('dialog')?.textContent ?? ''
      },
      {
        x: editButtonBox!.x + editButtonBox!.width / 2,
        y: editButtonBox!.y + editButtonBox!.height / 2,
      },
    )
    expect(elementAtEditButton).toContain('Take a breath')
    let stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-target']?.waitingUntil).toBeUndefined()
    expect(stored.groupPauseState?.['pause-target']?.pausedUntil).toBeUndefined()

    await page.clock.fastForward(4_000)
    await expect(pauseDialog.getByRole('button', { name: 'Pause 7 min' })).toBeDisabled()
    stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-target']?.pausedUntil).toBeUndefined()

    await page.clock.fastForward(1_000)
    await expect(pauseDialog.getByRole('button', { name: 'Pause 7 min' })).toBeEnabled()
    const pauseRequestedAt = await page.evaluate(() => Date.now())
    await pauseDialog.getByRole('button', { name: 'Pause 7 min' }).click()
    await expect(page.getByText(/Paused 7:00|Paused 6:59/)).toBeVisible()
    stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    const pausedUntil = stored.groupPauseState?.['pause-target']?.pausedUntil
    expect(pausedUntil).toBeGreaterThanOrEqual(pauseRequestedAt + 7 * 60_000)
    expect(pausedUntil).toBeLessThan(pauseRequestedAt + 7 * 60_000 + 5_000)
    expect(stored.groupPauseState?.['pause-target']?.waitingUntil).toBeUndefined()
  })

  test('一時停止前カウントダウンのキャンセルとフォーカス喪失は保存しない', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'blockedPage',
          redirectUrl: 'https://blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'pause-cancel-target',
            name: 'Pause cancel target',
            mode: 'blacklist',
            lockMode: false,
            patterns: ['example\\.com'],
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 0,
            })),
          },
        ],
      })
    })
    await page.clock.install({ time: new Date('2026-05-06T12:00:00+09:00') })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    const pauseDialog = page.locator('dialog').filter({ hasText: 'Take a breath' })
    await expect(pauseDialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await pauseDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(pauseDialog).not.toBeVisible()

    let stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-cancel-target']).toBeUndefined()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    await expect(pauseDialog.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(pauseDialog).not.toBeVisible()
    stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-cancel-target']).toBeUndefined()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    await expect(pauseDialog.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(pauseDialog).not.toBeVisible()
    stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            local: {
              get: (keys: string[]) => Promise<{
                groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
              }>
            }
          }
        }
      }
      return chromeApi.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-cancel-target']).toBeUndefined()
  })

  test('Pause を禁止したグループは一時停止できず、保存済みの一時停止も解除される', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    /** Pause 禁止フラグを指定してテスト対象グループを保存する。 */
    const savePauseTargetGroup = async (pauseAllowed: boolean): Promise<void> =>
      serviceWorker.evaluate(async (allowed) => {
        const chromeApi = globalThis as unknown as {
          chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
        }
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            dailyResetHour: '03:00',
          },
          groups: [
            {
              id: 'pause-forbidden',
              name: 'Pause forbidden',
              mode: 'blacklist',
              lockMode: false,
              patterns: ['example\\.com'],
              blockAction: 'blockedPage',
              redirectUrl: 'https://blocked.test',
              pauseAllowed: allowed,
              timeWindows: [{ type: 'always' }],
              restrictions: [{ type: 'block' }],
            },
          ],
        })
      }, pauseAllowed)
    /** storage.local に保存されている一時停止期限を返す。 */
    const storedPausedUntil = async (): Promise<number | null> =>
      serviceWorker.evaluate(async () => {
        const chromeApi = globalThis as unknown as {
          chrome: {
            storage: {
              local: {
                get: (keys: string[]) => Promise<{
                  groupPauseState?: Record<string, { waitingUntil?: number; pausedUntil?: number }>
                }>
              }
            }
          }
        }
        const stored = await chromeApi.chrome.storage.local.get(['groupPauseState'])
        return stored.groupPauseState?.['pause-forbidden']?.pausedUntil ?? null
      })

    await savePauseTargetGroup(true)
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await expect(page.getByRole('button', { name: 'Edit group' })).toBeVisible()

    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: { storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } } }
      }
      await chromeApi.chrome.storage.local.set({
        groupPauseState: { 'pause-forbidden': { pausedUntil: Date.now() + 600_000 } },
      })
    })
    await expect(page.getByText(/Paused \d/)).toBeVisible()
    await expect.poll(storedPausedUntil).toBeGreaterThan(0)

    await savePauseTargetGroup(false)

    await expect.poll(storedPausedUntil).toBeNull()
    await expect(page.getByText(/Paused \d/)).toHaveCount(0)

    await page.reload()
    await expect(page.getByText('Not allowed')).toBeVisible()
    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Pause' })).toBeDisabled()
    await expect(page.getByText('Pause is turned off for this group.')).toBeVisible()
  })

  test('Pause 設定を Off にすると保存され、Pause メニューが無効になる', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'blockedPage',
          redirectUrl: 'https://blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'pause-toggle',
            name: 'Pause toggle',
            mode: 'blacklist',
            lockMode: false,
            patterns: ['example\\.com'],
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            timeWindows: [{ type: 'always' }],
            restrictions: [{ type: 'block' }],
          },
        ],
      })
    })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Edit group' }).click()
    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByRole('radio', { name: 'Allow Pause Off' }).check()
    await expect(page.getByRole('spinbutton', { name: 'Pause duration minutes' })).toBeDisabled()
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.getByText('Not allowed')).toBeVisible()
    await expect
      .poll(async () =>
        serviceWorker.evaluate(async () => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                sync: {
                  get: (keys: string[]) => Promise<{ groups?: Array<{ pauseAllowed?: boolean }> }>
                }
              }
            }
          }
          const stored = await chromeApi.chrome.storage.sync.get(['groups'])
          return stored.groups?.[0]?.pauseAllowed ?? null
        }),
      )
      .toBe(false)

    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Pause' })).toBeDisabled()
  })

  test('Pause 設定のバリデーションエラーを出してもカードのレイアウトが崩れない', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: { storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } } }
      }
      await chromeApi.chrome.storage.sync.set({
        global: {
          blockAction: 'blockedPage',
          redirectUrl: 'https://blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'pause-invalid',
            name: 'Pause invalid',
            mode: 'blacklist',
            lockMode: false,
            patterns: ['example\\.com'],
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            timeWindows: [{ type: 'always' }],
            restrictions: [{ type: 'block' }],
          },
        ],
      })
    })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Edit group' }).click()
    await page.getByRole('button', { name: 'Options' }).click()

    const waitInput = page.getByRole('spinbutton', { name: 'Wait seconds before pausing' })
    const durationInput = page.getByRole('spinbutton', { name: 'Pause duration minutes' })
    const groupCard = page.locator('article').first()
    const secLabelBox = await page.getByText('sec', { exact: true }).boundingBox()
    const waitInputBox = await waitInput.boundingBox()
    expect(secLabelBox).not.toBeNull()
    expect(waitInputBox).not.toBeNull()

    await waitInput.fill('')
    await durationInput.fill('0')

    await expect(page.getByText('Enter a whole number of 0 or greater.')).toBeVisible()
    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()

    // エラーは入力行の外に出るので、単位ラベルは入力欄と縦位置を保ったままになる。
    const secLabelBoxWithError = await page.getByText('sec', { exact: true }).boundingBox()
    const waitInputBoxWithError = await waitInput.boundingBox()
    expect(secLabelBoxWithError).not.toBeNull()
    expect(waitInputBoxWithError).not.toBeNull()
    const labelOffsetBefore = secLabelBox!.y - waitInputBox!.y
    const labelOffsetAfter = secLabelBoxWithError!.y - waitInputBoxWithError!.y
    expect(Math.abs(labelOffsetAfter - labelOffsetBefore)).toBeLessThanOrEqual(1)

    // カードが横方向にはみ出さない（overflow-hidden でエラー文が切れない）。
    await expectNoHorizontalOverflow(groupCard)
  })

  test('Lock Mode ON では Pause 設定の緩和が次の rule day まで保留される', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedLockedPauseGroup(serviceWorker)
    await page.clock.install({ time: new Date('2026-05-06T12:00:00+09:00') })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Edit group' }).click()
    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByRole('spinbutton', { name: 'Wait seconds before pausing' }).fill('0')
    await page.getByRole('spinbutton', { name: 'Pause duration minutes' }).fill('1440')

    // フィールド単位で、いま効いている値と適用時期を示す。
    await expect(page.getByText(/Still 5 sec until /)).toBeVisible()
    await expect(page.getByText(/Still 7 min until /)).toBeVisible()

    await page.getByRole('button', { name: 'Save group' }).click()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    const pauseDialog = page.locator('dialog').filter({ hasText: 'Take a breath' })
    // 待機は 0 秒に短縮されず、一時停止も 1440 分に延長されない。
    await expect(pauseDialog.getByText('5s remaining')).toBeVisible()
    await expect(pauseDialog.getByRole('button', { name: 'Pause 7 min' })).toBeDisabled()
  })

  test('Lock Mode ON でも Pause 設定の強化は即時に反映される', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedLockedPauseGroup(serviceWorker)
    await page.clock.install({ time: new Date('2026-05-06T12:00:00+09:00') })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Edit group' }).click()
    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByRole('spinbutton', { name: 'Wait seconds before pausing' }).fill('20')
    await page.getByRole('spinbutton', { name: 'Pause duration minutes' }).fill('3')

    // 強化方向なので保留にはならない。
    await expect(page.getByText(/Still \d+ sec until /)).toHaveCount(0)
    await expect(page.getByText(/Still \d+ min until /)).toHaveCount(0)

    await page.getByRole('button', { name: 'Save group' }).click()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    const pauseDialog = page.locator('dialog').filter({ hasText: 'Take a breath' })
    await expect(pauseDialog.getByText('20s remaining')).toBeVisible()
    await expect(pauseDialog.getByRole('button', { name: 'Pause 3 min' })).toBeDisabled()
  })

  test('Incognito mode の Chrome 拡張詳細ページを開ける', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    const pagePromise = context.waitForEvent('page')
    await page.getByRole('button', { name: 'Open Chrome extension settings' }).click()
    const extensionSettingsPage = await pagePromise

    await expect(extensionSettingsPage).toHaveURL(`chrome://extensions/?id=${extensionId}`)
  })

  test('セクション切り替え時にサイドバーの位置がずれない', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: {
              set: (items: Record<string, unknown>) => Promise<void>
            }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({
        groups: Array.from({ length: 12 }, (_, index) => ({
          id: `group-${index}`,
          name: `Group ${index + 1}`,
          mode: 'blacklist',
          patterns: [`example-${index}\\.com`],
          dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: undefined,
          })),
        })),
      })
    })
    await page.setViewportSize({ width: 1100, height: 700 })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    const sidebarHeading = page.getByRole('heading', { name: 'Regex URL Guard' })
    const groupsBox = await sidebarHeading.boundingBox()
    expect(groupsBox).not.toBeNull()

    await openGeneralSettings(page)
    const generalBox = await sidebarHeading.boundingBox()
    expect(generalBox).not.toBeNull()

    expect(generalBox!.x).toBeCloseTo(groupsBox!.x, 1)
    expect(generalBox!.width).toBeCloseTo(groupsBox!.width, 1)
  })

  test('残り時間通知の ON/OFF と分数設定を保存できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await page.getByLabel('Minutes before daily limit warning', { exact: true }).fill('12')
    await expectGlobalSettingsStored(page, { notificationThresholdMinutes: 12 })
    await expectVisibleGroupsStored(page)
    await page.reload()
    await openGeneralSettings(page)
    await expect(
      page.getByRole('checkbox', { name: 'Notify me before the daily limit is reached' }),
    ).toBeChecked()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('12')

    await page
      .getByRole('checkbox', { name: 'Notify me before the daily limit is reached' })
      .uncheck()
    await expectGlobalSettingsStored(page, { remainingTimeNotificationsEnabled: false })
    await expectVisibleGroupsStored(page)
    await page.reload()
    await openGeneralSettings(page)
    await expect(
      page.getByRole('checkbox', { name: 'Notify me before the daily limit is reached' }),
    ).not.toBeChecked()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('12')

    await page
      .getByRole('checkbox', { name: 'Notify me before the daily limit is reached' })
      .check()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toBeEnabled()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('12')

    await page.getByLabel('Minutes before daily limit warning', { exact: true }).fill('0')
    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()
  })

  test('設定を JSON ファイルとしてエクスポートできる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Exported')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGeneralSettings(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export settings' }).click()
    const download = await downloadPromise
    const path = await download.path()

    expect(download.suggestedFilename()).toBe('regex-url-guard-settings.json')
    expect(path).not.toBeNull()

    const exported = JSON.parse(await fs.readFile(path!, 'utf8')) as Record<string, unknown>
    expect(exported.version).toBe(12)
    expect(exported.settings).toMatchObject({
      groups: [{ name: 'Exported', patterns: ['example\\.com'] }],
    })
  })

  test('設定ファイルをインポートすると既存設定が全置換される', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('BeforeImport')
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGeneralSettings(page)
    await page.getByLabel('Settings JSON file').setInputFiles(
      jsonUploadFile('settings.json', {
        version: 2,
        settings: {
          global: {
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            dailyResetHour: '04:30',
            notificationThresholdMinutes: 9,
          },
          groups: [
            {
              id: 'imported-group',
              name: 'Imported',
              mode: 'blacklist',
              patterns: ['imported\\.example'],
              dailyRules: dailyRules({ dailyLimitMinutes: 15 }),
            },
          ],
        },
      }),
    )

    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('04:30')
    await expect(
      page.getByRole('checkbox', { name: 'Notify me before the daily limit is reached' }),
    ).toBeChecked()
    await expect(
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ).toHaveValue('9')
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('Imported')
    await expect(page.locator('main').getByText('Options')).not.toBeVisible()
    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    await expect(urlPatternsSection.getByText('imported\\.example', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
    await expect(page.getByLabel('Rule 1')).toContainText('Allow 15 min per day')
    await expect(page.getByText('BeforeImport')).not.toBeVisible()
    const stored = (await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: {
              get: (keys: string[]) => Promise<Record<string, unknown>>
            }
          }
        }
      }
      return chromeApi.chrome.storage.sync.get(['global', 'groups'])
    })) as { global?: Record<string, unknown>; groups?: Array<Record<string, unknown>> }
    expect(stored.global?.dailyResetHour).toBe('04:30')
    expect(stored.global?.remainingTimeNotificationsEnabled).toBe(true)
    expect(stored.global?.notificationThresholdMinutes).toBe(9)
    expect(stored.groups).toHaveLength(1)
    expect(stored.groups?.[0].name).toBe('Imported')
  })

  test('保留中は希望設定を表示し、保留フィールドを注記で示す', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await waitForEffectiveSettings(serviceWorker)
    await serviceWorker.evaluate(
      async (logicalDate) => {
        const chromeApi = globalThis as unknown as {
          chrome: {
            storage: {
              sync: { set: (items: Record<string, unknown>) => Promise<void> }
              local: { set: (items: Record<string, unknown>) => Promise<void> }
            }
          }
        }
        const activeSettings = {
          global: {
            blockAction: 'redirect',
            redirectUrl: 'https://active-blocked.test',
            dailyResetHour: '03:00',
          },
          groups: [
            {
              id: 'work',
              name: 'Work',
              mode: 'blacklist',
              lockMode: true,
              patterns: ['active\\.example'],
              blockAction: 'redirect',
              redirectUrl: 'https://active-blocked.test',
              dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                blockedTimeRanges: [{ startMinute: 540, endMinute: 1020 }],
                dailyLimitMinutes: 10,
              })),
            },
            {
              id: 'allowlist',
              name: 'Allowlist',
              mode: 'whitelist',
              lockMode: false,
              patterns: [],
              blockAction: 'blockedPage',
              redirectUrl: 'https://unused-blocked.test',
              dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                blockedTimeRanges: [],
                dailyLimitMinutes: undefined,
              })),
            },
          ],
        }
        await chromeApi.chrome.storage.local.set({
          effectiveSettings: activeSettings,
          effectiveSettingsLogicalDate: logicalDate,
        })
        await chromeApi.chrome.storage.sync.set({
          global: {
            blockAction: 'redirect',
            redirectUrl: 'https://preferred-blocked.test',
            dailyResetHour: '05:00',
          },
          groups: [
            {
              id: 'work',
              name: 'Work',
              mode: 'blacklist',
              lockMode: true,
              patterns: ['active\\.example'],
              blockAction: 'redirect',
              redirectUrl: 'https://preferred-blocked.test',
              dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                blockedTimeRanges: [],
                dailyLimitMinutes: 30,
              })),
            },
            {
              id: 'allowlist',
              name: 'Allowlist',
              mode: 'whitelist',
              lockMode: false,
              patterns: [],
              blockAction: 'blockedPage',
              redirectUrl: 'https://unused-blocked.test',
              dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                blockedTimeRanges: [],
                dailyLimitMinutes: undefined,
              })),
            },
          ],
        })
      },
      logicalDateId(new Date(), '03:00'),
    )

    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGeneralSettings(page)
    await expect(page.getByLabel('Start a new rule day at this time')).toHaveValue('03:00')
    await expect(page.getByLabel('Start a new rule day at this time')).toBeDisabled()
    await expect(
      page.getByText('Cannot change while any group has Lock Mode enabled or pending.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Rule 1').first()).toContainText('Always')
    await expect(page.getByLabel('Rule 1').first()).toContainText('Allow 30 min per day')
    // 保留状況はグループ全体のバナーではなく、フィールド単位の注記だけで示す。
    await expect(page.getByText('Earlier restrictions are still active.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View active settings' })).toHaveCount(0)
    await expect(page.getByText(/Earlier rules stay active until /)).toBeVisible()
    // patterns は希望設定と基準設定で同じなので保留にはならない。
    await expect(page.getByText(/Earlier URL patterns stay active until /)).toHaveCount(0)
    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Pause' }).first()).toBeEnabled()
    await expect(page.getByRole('menuitem', { name: 'Active settings only' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Group actions' }).first().click()
    await expect(page.locator('dialog').filter({ hasText: 'Take a breath' })).not.toBeVisible()
  })

  test('Lock Mode ON のグループを Disable しても同じ論理日中は有効のままだと注記で示す', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(
      async (logicalDate) => {
        const chromeApi = globalThis as unknown as {
          chrome: {
            storage: {
              sync: { set: (items: Record<string, unknown>) => Promise<void> }
              local: { set: (items: Record<string, unknown>) => Promise<void> }
            }
          }
        }
        const settings = {
          global: {
            blockAction: 'blockedPage',
            redirectUrl: 'https://blocked.test',
            dailyResetHour: '03:00',
          },
          groups: [
            {
              id: 'locked-disable',
              name: 'Locked disable',
              mode: 'blacklist',
              disabled: false,
              lockMode: true,
              patterns: ['example\\.com'],
              blockAction: 'blockedPage',
              redirectUrl: 'https://blocked.test',
              dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                blockedTimeRanges: [],
                dailyLimitMinutes: 0,
              })),
            },
          ],
        }
        await chromeApi.chrome.storage.local.set({
          effectiveSettings: settings,
          effectiveSettingsLogicalDate: logicalDate,
        })
        await chromeApi.chrome.storage.sync.set(settings)
      },
      logicalDateId(new Date(), '03:00'),
    )
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Disable' }).click()

    // 希望設定は Disabled になるが、Lock Mode により同じ論理日中は制限が効き続ける。
    await expect(page.getByRole('status').filter({ hasText: 'Disabled' })).toBeVisible()
    await expect(page.getByText(/This group stays enforced until /)).toBeVisible()
    await expect(page.getByText('Earlier restrictions are still active.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View active settings' })).toHaveCount(0)
  })

  test('希望設定から削除済みの active group は専用セクションに読み取り専用で残る', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
            local: { set: (items: Record<string, unknown>) => Promise<void> }
          }
        }
      }
      const activeSettings = {
        global: {
          blockAction: 'redirect',
          redirectUrl: 'https://active-blocked.test',
          dailyResetHour: '03:00',
        },
        groups: [
          {
            id: 'deleted-active',
            name: 'Deleted active',
            mode: 'blacklist',
            lockMode: true,
            patterns: ['deleted\\.example'],
            blockAction: 'redirect',
            redirectUrl: 'https://active-blocked.test',
            dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 0,
            })),
          },
        ],
      }
      await chromeApi.chrome.storage.sync.set(activeSettings)
    })
    await waitForEffectiveSettings(serviceWorker)
    await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { set: (items: Record<string, unknown>) => Promise<void> }
          }
        }
      }
      await chromeApi.chrome.storage.sync.set({ groups: [] })
    })
    await expect
      .poll(async () => {
        return serviceWorker.evaluate(async () => {
          const chromeApi = globalThis as unknown as {
            chrome: {
              storage: {
                local: {
                  get: (key: string) => Promise<{ effectiveSettings?: { groups?: unknown[] } }>
                }
              }
            }
          }
          return (await chromeApi.chrome.storage.local.get('effectiveSettings')).effectiveSettings
            ?.groups?.length
        })
      })
      .toBe(1)
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    // 削除済みグループは専用の見出しセクション配下に読み取り専用で残る。
    const retainedSection = page.getByLabel('Earlier active groups')
    await expect(retainedSection).toContainText('Earlier restrictions still active')
    await expect(retainedSection.getByLabel('Name')).toHaveValue('Deleted active')
    await expect(retainedSection.getByRole('button', { name: 'Edit group' })).not.toBeVisible()
    await expect(retainedSection.getByRole('button', { name: 'Delete group' })).not.toBeVisible()
    await expect(retainedSection.getByRole('button', { name: 'Group actions' })).toHaveCount(0)
    // 編集へ復帰する手段として Restore だけを残す。
    await expect(retainedSection.getByRole('button', { name: 'Restore group' })).toBeVisible()
    await expect(page.getByText('Earlier restrictions are still active.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View active settings' })).toHaveCount(0)
    await expect(page.locator('dialog').filter({ hasText: 'Take a breath' })).not.toBeVisible()
  })

  test('取り残しの active group を Restore すると通常の一覧へ戻り編集できる', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await seedDeletedActiveGroup(serviceWorker)
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page
      .getByLabel('Earlier active groups')
      .getByRole('button', { name: 'Restore group' })
      .click()

    // 通常のグループカードへ戻り、編集・削除メニューが使えるようになる。
    await expect(page.getByLabel('Earlier active groups')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toHaveValue('Deleted active')
    await expect(page.getByRole('button', { name: 'Edit group' })).toBeVisible()
    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expectVisibleGroupsStored(page)

    // 同じ id で保存されるため、リロードしても二重にならない。
    await page.reload()
    await expect(page.getByLabel('Name')).toHaveValue('Deleted active')
    await expect(page.getByLabel('Earlier active groups')).toHaveCount(0)
    await expect(page.getByText('1 group')).toBeVisible()
  })

  test('不正な設定ファイルはインポートせず既存設定を残す', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('StillHere')
    await addRequiredGroupSections(page)
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGeneralSettings(page)
    await page.getByLabel('Settings JSON file').setInputFiles(jsonUploadFile('bad.json', '{'))

    await expect(page.getByText('Invalid JSON')).toBeVisible()
    await page.getByRole('button', { name: 'Groups' }).click()
    await expect(page.getByLabel('Name')).toHaveValue('StillHere')
  })

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

  test('グループ作成ダイアログをキャンセルすると新規カードを作らない', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.getByRole('button', { name: 'Add group' }).click()
    await expect(page.getByRole('button', { name: 'Create blank group' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from core social 15 min/day template' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from video 30 min/day template' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from work hours focus template' }),
    ).toBeVisible()
    await expect(page.getByText('30 min/day', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Block nights', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Allow nights', { exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Cancel create group' }).click()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
    await expect(page.getByText('New group')).not.toBeVisible()
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

  test('Options disclosure には高度な設定だけを表示し、遷移先はルール行で選ぶ', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Locked')
    const optionsButton = page.locator('main').getByRole('button', { name: 'Options' }).last()
    await expect(optionsButton).toBeVisible()
    await expect(optionsButton).toHaveAttribute('aria-expanded', 'false')
    // 廃止済み: URL pattern match behavior / Page shown when blocked セクション
    await expect(
      page.getByRole('radio', { name: 'URL pattern match behavior Block matches' }),
    ).toHaveCount(0)
    await expect(page.locator('fieldset[aria-label="Page shown when blocked"]')).toHaveCount(0)
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day Off' }),
    ).not.toBeVisible()

    // 遷移先はルール行の中で選び、URL はその場で入力する
    await expect(page.getByLabel('Rule 1 destination URL')).not.toBeVisible()
    await page.getByRole('button', { name: 'Add rule' }).last().click()
    await expect(page.getByLabel('Rule 1 destination')).toHaveValue('blockedPage')
    await page.getByLabel('Rule 1 destination').selectOption('redirect')
    await expect(page.getByLabel('Rule 1 destination URL')).toBeVisible()
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')

    await optionsButton.click()
    await expect(optionsButton).toHaveAttribute('aria-expanded', 'true')
    const optionsPanel = page.locator('main [id^="options-panel-"]').last()
    await expect(
      optionsPanel.getByRole('radio', { name: 'URL pattern match behavior Block matches' }),
    ).toHaveCount(0)
    await expect(
      optionsPanel.getByRole('radio', {
        name: 'Delay relaxed restrictions until next rule day Off',
      }),
    ).toBeChecked()
    await expect(
      optionsPanel.getByRole('radio', {
        name: 'Delay relaxed restrictions until next rule day On',
      }),
    ).toBeVisible()
    await expect(
      optionsPanel.getByText(
        'Stricter changes apply immediately. Relaxed restrictions take effect on the next rule day.',
      ),
    ).toBeVisible()
    await optionsPanel
      .getByRole('radio', { name: 'Delay relaxed restrictions until next rule day On' })
      .check()
    await expect(
      optionsPanel.getByRole('radio', {
        name: 'Delay relaxed restrictions until next rule day On',
      }),
    ).toBeChecked()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.locator('main').getByText('Options')).toBeVisible()
    await expect(
      page.locator('main').getByText('Delay relaxed restrictions until next rule day'),
    ).toBeVisible()
    await expect(
      page.getByText(
        'Stricter changes apply immediately. Relaxed restrictions take effect on the next rule day.',
      ),
    ).not.toBeVisible()
    await expect(page.locator('main').getByText('On', { exact: true })).toBeVisible()
    await expect(
      page.locator('main').getByText('Page shown when blocked', { exact: true }),
    ).not.toBeVisible()
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day On' }),
    ).not.toBeVisible()
    await page.getByRole('button', { name: 'Edit group' }).click()
    await openGroupOptions(page)
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day On' }),
    ).toBeChecked()
    await page
      .getByRole('radio', { name: 'Delay relaxed restrictions until next rule day Off' })
      .check()
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day Off' }),
    ).toBeChecked()
  })

  test('Lock Mode group がある間、rule day 開始時刻入力が無効化される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LockedReset')
    await addRequiredGroupSections(page)
    await openGroupOptions(page)
    await page
      .getByRole('radio', { name: 'Delay relaxed restrictions until next rule day On' })
      .check()
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGeneralSettings(page)
    await expect(page.getByLabel('Start a new rule day at this time')).toBeDisabled()
    await expect(
      page.getByText('Cannot change while any group has Lock Mode enabled or pending.'),
    ).toBeVisible()
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

  test('パターン追加時に空の URL pattern 入力が追加される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveAttribute(
      'placeholder',
      'example.com or ^https?://(www\\.)?example\\.com/private',
    )
    await expect(
      page.getByText('Enter a valid URL pattern or regular expression.'),
    ).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Delete pattern' })).toBeVisible()
  })

  test('空の各セクションでは空状態を表示せず、統一された追加ボタンを表示する', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    const rulesSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Rules' }) })
      .last()
    const addButtons = [
      urlPatternsSection.getByRole('button', { name: 'Add URL pattern' }),
      rulesSection.getByRole('button', { name: 'Add rule' }),
    ]

    await expect(page.getByLabel('No URL patterns')).toHaveCount(0)

    for (const addButton of addButtons) {
      await expect(addButton).toBeVisible()
      await expect(addButton).toHaveClass(/border-primary\/30/)
    }

    await expect(addButtons[0]).toHaveText('URL pattern')
    await expect(addButtons[1]).toHaveText('Rule')

    const [patternsHeadingBox, patternButtonBox, rulesHeadingBox, ruleButtonBox] =
      await Promise.all([
        urlPatternsSection.getByRole('heading', { name: 'URL patterns' }).boundingBox(),
        addButtons[0].boundingBox(),
        rulesSection.getByRole('heading', { name: 'Rules' }).boundingBox(),
        addButtons[1].boundingBox(),
      ])
    expect(patternButtonBox!.y).toBeGreaterThan(patternsHeadingBox!.y)
    expect(ruleButtonBox!.y).toBeGreaterThan(rulesHeadingBox!.y)
  })

  test('必須の設定セクションが空のグループは保存できない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Incomplete')

    await expect(page.getByText('Add at least one URL pattern.')).toHaveCount(0)
    await expect(page.getByText('Add at least one rule.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save group' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Add at least one URL pattern.')).toBeVisible()
    await expect(page.getByText('Add at least one rule.')).toBeVisible()

    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()

    await expect(page.getByText('Add at least one URL pattern.')).toHaveCount(0)
    await expect(page.getByText('Add at least one rule.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save group' })).toBeEnabled()
  })

  test('編集可能な入力欄は共通の field 色で表示される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('textbox', { name: 'URL pattern' }).blur()
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 when').selectOption('daily')
    await page.getByLabel('Rule 1 restriction').last().selectOption('dailyLimit')
    const groupInputs = [
      page.getByLabel('Name'),
      page.getByRole('textbox', { name: 'URL pattern' }),
      page.getByLabel('Active time ranges'),
      page.getByLabel('Rule 1 daily limit minutes'),
    ]

    for (const input of groupInputs) {
      await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(input).toHaveCSS('border-top-color', 'rgb(209, 213, 219)')
    }

    await openGeneralSettings(page)
    const generalInputs = [
      page.getByLabel('Start a new rule day at this time'),
      page.getByLabel('Minutes before daily limit warning', { exact: true }),
    ]

    for (const input of generalInputs) {
      await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(input).toHaveCSS('border-top-color', 'rgb(209, 213, 219)')
    }
  })

  test('グループを追加して保存→リロード後も保持される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Twitter')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page
      .getByRole('textbox', { name: 'URL pattern' })
      .fill('^https?://(www\\.)?twitter\\.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    await expect(page.getByLabel('Name')).toHaveValue('Twitter')
    await expect(
      urlPatternsSection.getByText('^https?://(www\\.)?twitter\\.com', { exact: true }),
    ).toBeVisible()
    await expect(
      urlPatternsSection.getByText('^https?://(www\\.)?twitter\\.com', { exact: true }),
    ).toHaveCSS('font-family', '"Roboto Mono"')
    await expect(page.getByLabel('Name')).toBeDisabled()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete pattern' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Group actions' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).not.toBeVisible()
  })

  test('Wait の待機秒数と通過後許可期間を保存→リロード後も保持される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Wait gate')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 restriction').selectOption('wait')
    await page.getByLabel('Rule 1 wait seconds').fill('30')
    await page.getByLabel('Rule 1 grant minutes').fill('25')
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.getByLabel('Rule 1')).toContainText('Wait 30 sec, then allow 25 min')
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Rule 1')).toContainText('Wait 30 sec, then allow 25 min')
    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByLabel('Rule 1 wait seconds')).toHaveValue('30')
    await expect(page.getByLabel('Rule 1 grant minutes')).toHaveValue('25')
  })

  test('Wait の通過後許可期間は1分以上を必須にする', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Invalid wait grant')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 restriction').selectOption('wait')
    await page.getByLabel('Rule 1 grant minutes').fill('0')

    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()
  })

  test('制限種別は Block / Daily limit / Wait の3種のみで Session limit は選べない', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add rule' }).click()

    const restriction = page.getByLabel('Rule 1 restriction')
    await expect(restriction.locator('option')).toHaveText([
      'Block access',
      'Daily limit',
      'Wait before access',
    ])
  })

  test('重なるルールは保存を止めず、影響を警告として表示する', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Overlapping')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')

    const addRule = page.getByRole('button', { name: 'Add rule' })
    await addRule.click()
    await expect(page.getByLabel('Rule 1 restriction')).toHaveValue('block')

    await addRule.click()
    await page.getByLabel('Rule 2 restriction').selectOption('dailyLimit')

    // Block が同じ時間帯を覆うので Daily limit は効かない、と警告する。
    await expect(
      page.getByText(
        'Block overlaps with Daily limit. While Block is active, Daily limit has no effect.',
      ),
    ).toBeVisible()

    // 警告は保存を妨げない。
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await expect(page.getByLabel('Name')).toHaveValue('Overlapping')
  })

  test('適用順の説明はツールチップに格納され、常時は表示しない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await createBlankGroup(page)

    const orderText = page.getByText('The first rule that applies wins. Wait only gates access', {
      exact: false,
    })
    await expect(orderText).toHaveCount(0)

    const trigger = page.getByRole('button', { name: 'How overlapping rules are applied' })
    await trigger.hover()
    await expect(orderText).toBeVisible()
    await expect(page.getByRole('tooltip')).toContainText('1. Block')
    await expect(page.getByRole('tooltip')).toContainText('3. Wait')

    await page.getByRole('heading', { name: 'Rules' }).hover()
    await expect(orderText).toHaveCount(0)

    // キーボード操作でも開き、Escape で閉じる。
    await trigger.focus()
    await expect(orderText).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(orderText).toHaveCount(0)
  })

  test('保存時にルールを評価順へ並べ替える', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Sorted')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')

    const addRule = page.getByRole('button', { name: 'Add rule' })
    // Wait → Daily limit → Block の順に足す。
    await addRule.click()
    await page.getByLabel('Rule 1 restriction').selectOption('wait')
    await addRule.click()
    await page.getByLabel('Rule 2 restriction').selectOption('dailyLimit')
    await addRule.click()
    await expect(page.getByLabel('Rule 3 restriction')).toHaveValue('block')

    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    // 保存後は Block → Daily limit → Wait の評価順に並ぶ。
    await expect(page.getByLabel('Rule 1')).toContainText('Block access')
    await expect(page.getByLabel('Rule 2')).toContainText('Allow 30 min per day')
    await expect(page.getByLabel('Rule 3')).toContainText('Wait 60 sec')
  })

  test('ケバブメニューからグループを無効化し、リロード後も Disabled 表示を保持する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Disabled target')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Pause', { exact: true })).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Options' })).not.toBeVisible()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Disable' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Disabled' })).toBeVisible()
    await expect(page.getByText('Group status')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Options' })).not.toBeVisible()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Disabled target')
    await expect(page.getByRole('status').filter({ hasText: 'Disabled' })).toBeVisible()
    await expect(page.getByText('Group status')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Options' })).not.toBeVisible()
    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Pause' })).toBeDisabled()
    await expect(page.getByText('Enable this group to use Pause.')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Enable' })).toBeEnabled()
    const stored = await serviceWorker.evaluate(async () => {
      const chromeApi = globalThis as unknown as {
        chrome: {
          storage: {
            sync: { get: (keys: string[]) => Promise<{ groups?: Array<Record<string, unknown>> }> }
          }
        }
      }
      return chromeApi.chrome.storage.sync.get(['groups'])
    })
    expect(stored.groups?.[0].disabled).toBe(true)

    await page.getByRole('menuitem', { name: 'Enable' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Disabled' })).not.toBeVisible()
    await expect(page.getByText('Enable this group to use Pause.')).not.toBeVisible()
    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Pause' })).toBeEnabled()
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    await expect(
      page
        .locator('dialog')
        .filter({ hasText: 'Take a breath' })
        .getByRole('heading', { name: 'Take a breath' }),
    ).toBeVisible()
  })

  test('ケバブメニューからグループを編集可能な新規ドラフトとして複製する', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Focus')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Duplicate group' }).click()

    const duplicatedCard = page.locator('[data-new-group-card="true"]')
    await expect(page.getByText('2 groups')).toBeVisible()
    await expect(duplicatedCard.getByLabel('Name')).toHaveValue('Focus copy')
    await expect(duplicatedCard.getByLabel('Name')).toBeEnabled()
    await expect(duplicatedCard.getByRole('textbox', { name: 'URL pattern' })).toHaveValue(
      'example\\.com',
    )

    await duplicatedCard.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveCount(2)
    await expect(page.getByLabel('Name').nth(0)).toHaveValue('Focus')
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Focus copy')
  })

  test('グループの複製ドラフトをキャンセルすると保存しない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Focus')
    await addRequiredGroupSections(page)
    await page.getByRole('button', { name: 'Save group' }).click()
    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Duplicate group' }).click()
    await page.getByRole('button', { name: 'Cancel group' }).click()

    await expect(page.getByText('1 group', { exact: true })).toBeVisible()
    await expectVisibleGroupsStored(page)
    await page.reload()
    await expect(page.getByLabel('Name')).toHaveCount(1)
  })

  test('ドメイン指定の URL pattern を保存できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('DomainBlock')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()
    await expect(page.getByLabel('Name')).toHaveValue('DomainBlock')
    await expect(urlPatternsSection.getByText('example.com', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
  })

  test('新規グループ作成をキャンセルすると保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('DraftOnly')
    await page.getByRole('button', { name: 'Cancel group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
  })

  test('既存グループ編集をキャンセルすると保存済み値へ戻る', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Saved')
    await addRequiredGroupSections(page)
    await page.getByRole('button', { name: 'Save group' }).click()

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel group' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeVisible()
    await page.getByLabel('Name').fill('Unsaved')
    await page.getByRole('button', { name: 'Cancel group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Name')).toHaveValue('Saved')
    await expect(page.getByText('Unsaved')).not.toBeVisible()
  })

  test('グループ名は編集モードでのみ編集でき、名前欄の編集アイコンは表示しない', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyName')
    await addRequiredGroupSections(page)
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeDisabled()

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.locator('label:has(input[aria-label="Name"]) svg')).toHaveCount(0)
    await expect(page.getByLabel('Name')).toBeEnabled()
    await expect(
      page.getByRole('button', { name: 'Create group from core social 15 min/day template' }),
    ).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from video 30 min/day template' }),
    ).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create group from work hours focus template' }),
    ).not.toBeVisible()
  })

  test('無効な正規表現はエラー表示され、保存されない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('[invalid')
    await page.getByLabel('Name').fill('Bad')

    await expect(page.getByText('Enter a valid URL pattern or regular expression.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Enter a valid URL pattern or regular expression.')).toBeVisible()
    await expectVisibleGroupsStored(page)
    await page.reload()

    // 無効なパターン文字列は保存されていない
    await expect(page.getByText('[invalid')).not.toBeVisible()
  })

  test('スケジュールルールの時間帯と上限分数を編集して永続化される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LimitedSite')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 when').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('09:15-10:45, 22:00-01:30')
    await page.getByLabel('Rule 1 restriction').selectOption('dailyLimit')
    await page.getByLabel('Rule 1 daily limit minutes').fill('30')
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Rule 1')).toContainText('Every day')
    await expect(page.getByLabel('Rule 1')).toContainText('09:15-10:45, 22:00-01:30')
    await expect(page.getByLabel('Rule 1')).toContainText('Allow 30 min per day')
  })

  test('不正な時間帯テキストはエラーを表示し保存しない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Invalid window')
    await addRequiredGroupSections(page)
    await page.getByLabel('Rule 1 when').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('not-a-time-range')

    await expect(
      page.getByText('Enter time ranges as HH:MM-HH:MM, separated by commas.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeVisible()
    await expectVisibleGroupsStored(page)
  })

  test('スケジュールルールが時間帯も上限もないと保存できない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('EmptyRule')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 restriction').last().selectOption('dailyLimit')
    await page.getByLabel('Rule 1 daily limit minutes').fill('30')
    await page.getByLabel('Rule 1 daily limit minutes').fill('')

    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()
  })

  test('Daily limit に 0 分は指定できない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ZeroLimit')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 restriction').last().selectOption('dailyLimit')
    await page.getByLabel('Rule 1 daily limit minutes').fill('0')

    // 0 分は Block と等価なので、Block ルールへ誘導するために弾く。
    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Enter a whole number of 1 or greater.')).toBeVisible()

    await page.getByLabel('Rule 1 daily limit minutes').fill('1')
    await expect(page.getByText('Enter a whole number of 1 or greater.')).not.toBeVisible()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Rule 1')).toContainText('Allow 1 min per day')
  })

  test('今日有効な上限がある場合に残り時間を表示する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
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
        groups: [
          {
            id: 'limited',
            name: 'Limited',
            mode: 'blacklist',
            patterns: ['example\\.com'],
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 30,
            })),
          },
        ],
      })
    })
    await waitForEffectiveSettings(serviceWorker)
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
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute(
      'aria-valuenow',
      String(25 * 60),
    )
  })

  test('カウンタ更新時に残り時間を更新する', async ({ page, serviceWorker, extensionId }) => {
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
        groups: [
          {
            id: 'limited',
            name: 'Limited',
            mode: 'blacklist',
            patterns: ['example\\.com'],
            dailyRules: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              blockedTimeRanges: [],
              dailyLimitMinutes: 30,
            })),
          },
        ],
      })
    })
    await waitForEffectiveSettings(serviceWorker)
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
    await expect(page.getByRole('meter', { name: 'Remaining time today' })).toHaveAttribute(
      'aria-valuenow',
      String(28 * 60),
    )
  })

  test('ブロック時間帯を日跨ぎで追加して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('NightBlock')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 when').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('22:00-06:00')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Rule 1')).toContainText('22:00-06:00')
  })

  test('曜日指定の上限ルールを個別に永続化できる', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('CustomDays')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    const timeWindowType = page.getByLabel('Rule 1 when')
    await expect(timeWindowType.locator('option')).toHaveText([
      'Always',
      'Every day',
      'Weekly',
      'Monthly',
      'Date range',
    ])
    await timeWindowType.selectOption('weekly')
    await page.getByRole('checkbox', { name: 'Monday' }).check()
    await page.getByLabel('Rule 1 restriction').selectOption('dailyLimit')
    await page.getByLabel('Rule 1 daily limit minutes').fill('60')
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Rule 1')).toContainText('Weekly Mon')
    await expect(page.getByLabel('Rule 1')).toContainText('Allow 60 min per day')
  })

  test('グループを削除して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ToDelete')
    await addRequiredGroupSections(page)
    await page.getByRole('button', { name: 'Save group' }).click()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Delete group' }).click()
    await expectDialogCentered(page, page.locator('dialog').filter({ hasText: 'Delete group?' }))
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('No groups')).toHaveText('No groups yet')
  })

  test('保存済みグループのアクションメニューは Edit ボタンの右に配置される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('LeftDelete')
    await addRequiredGroupSections(page)
    await page.getByRole('button', { name: 'Save group' }).click()

    const editBox = await page.getByRole('button', { name: 'Edit group' }).boundingBox()
    const actionsBox = await page.getByRole('button', { name: 'Group actions' }).boundingBox()

    expect(editBox).not.toBeNull()
    expect(actionsBox).not.toBeNull()
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).not.toBeVisible()
    expect(editBox!.x + editBox!.width).toBeLessThanOrEqual(actionsBox!.x)
    expect(Math.abs(editBox!.y - actionsBox!.y)).toBeLessThan(4)

    await openGroupActions(page)
    await expect(page.getByRole('menuitem', { name: 'Delete group' })).toBeVisible()
  })

  test('ブロック時の遷移先 URL を編集して永続化される', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('RedirectGroup')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 destination').selectOption('redirect')
    await page.getByLabel('Rule 1 destination URL').fill('https://blocked.example.test')
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    await expect(page.getByLabel('Rule 1').first()).toContainText(
      'Block access → https://blocked.example.test',
    )
    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByLabel('Rule 1 destination URL')).toHaveValue(
      'https://blocked.example.test',
    )
  })

  test('遷移先 URL が不正なら保存できない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('InvalidRedirectGroup')
    await page.getByRole('button', { name: 'Add rule' }).last().click()
    await page.getByLabel('Rule 1 destination').selectOption('redirect')
    await page.getByLabel('Rule 1 destination URL').fill('not-a-url')

    await expect(page.getByText('Enter a valid URL, including http:// or https://.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save group' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expect(page.getByText('Enter a valid URL, including http:// or https://.')).toBeVisible()
  })

  test('保存済みグループの閲覧時はフォーム部品が操作可能に見えない', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyVisuals')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example\\.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 when').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('09:00-17:00')
    await page.getByLabel('Rule 1 restriction').selectOption('dailyLimit')
    await page.getByLabel('Rule 1 daily limit minutes').fill('45')
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    const urlPatternsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'URL patterns' }) })
      .last()

    await expect(page.getByRole('textbox', { name: 'URL pattern' })).toHaveCount(0)
    await expect(urlPatternsSection.getByText('example\\.com', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Rule 1')).toContainText('09:00-17:00')
    await expect(page.getByLabel('Rule 1')).toContainText('Allow 45 min per day')
    await expect(page.getByLabel('Active time ranges')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add rule' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Add rule' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
  })

  test('保存済みグループの閲覧時はスケジュールルールが読み取り専用で表示される', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('ReadonlyRules')
    await page.getByRole('button', { name: 'Add URL pattern' }).click()
    await page.getByRole('textbox', { name: 'URL pattern' }).fill('example.com')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByLabel('Rule 1 when').selectOption('daily')
    await page.getByLabel('Active time ranges').fill('09:00-17:00')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByRole('button', { name: 'Save group' }).click()
    await expectVisibleGroupsStored(page)
    await page.reload()

    const timeWindow = page.getByLabel('Rule 1')
    await expect(timeWindow).toContainText('09:00-17:00')
    await expect(page.getByLabel('Active time ranges')).toHaveCount(0)
    const [cardBox, valueBox] = await Promise.all([
      timeWindow.locator('..').boundingBox(),
      timeWindow.boundingBox(),
    ])
    expect(valueBox!.y - cardBox!.y).toBeLessThan(16)

    await page.getByRole('button', { name: 'Edit group' }).click()
    await expect(page.getByLabel('Active time ranges')).toHaveValue('09:00-17:00')
  })
})
