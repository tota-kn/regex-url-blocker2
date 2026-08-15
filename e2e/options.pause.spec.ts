import { expect, test } from './fixtures'
import { seedLockedPauseGroup } from './optionsFixtures'
import { expectNoHorizontalOverflow, openGroupActions } from './optionsPage'

test.describe('Options pause', () => {
  test('グループ一時停止は設定した待機時間と継続時間を反映する', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(async () => {
      await globalThis.chrome.storage.sync.set({
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
      return globalThis.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-target']?.waitingUntil).toBeUndefined()
    expect(stored.groupPauseState?.['pause-target']?.pausedUntil).toBeUndefined()

    await page.clock.fastForward(4_000)
    await expect(pauseDialog.getByRole('button', { name: 'Pause 7 min' })).toBeDisabled()
    stored = await serviceWorker.evaluate(async () => {
      return globalThis.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-target']?.pausedUntil).toBeUndefined()

    await page.clock.fastForward(1_000)
    await expect(pauseDialog.getByRole('button', { name: 'Pause 7 min' })).toBeEnabled()
    const pauseRequestedAt = await page.evaluate(() => Date.now())
    await pauseDialog.getByRole('button', { name: 'Pause 7 min' }).click()
    await expect(page.getByText(/Paused 7:00|Paused 6:59/)).toBeVisible()
    stored = await serviceWorker.evaluate(async () => {
      return globalThis.chrome.storage.local.get(['groupPauseState'])
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
      await globalThis.chrome.storage.sync.set({
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
      return globalThis.chrome.storage.local.get(['groupPauseState'])
    })
    expect(stored.groupPauseState?.['pause-cancel-target']).toBeUndefined()

    await openGroupActions(page)
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    await expect(pauseDialog.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(pauseDialog).not.toBeVisible()
    stored = await serviceWorker.evaluate(async () => {
      return globalThis.chrome.storage.local.get(['groupPauseState'])
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
      return globalThis.chrome.storage.local.get(['groupPauseState'])
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
        await globalThis.chrome.storage.sync.set({
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
        const stored = await globalThis.chrome.storage.local.get(['groupPauseState'])
        return stored.groupPauseState?.['pause-forbidden']?.pausedUntil ?? null
      })

    await savePauseTargetGroup(true)
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await expect(page.getByRole('button', { name: 'Edit group' })).toBeVisible()

    await serviceWorker.evaluate(async () => {
      await globalThis.chrome.storage.local.set({
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
      await globalThis.chrome.storage.sync.set({
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
          const stored = await globalThis.chrome.storage.sync.get(['groups'])
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
      await globalThis.chrome.storage.sync.set({
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
})
