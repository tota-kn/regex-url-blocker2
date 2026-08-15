import { expect, test } from './fixtures'
import { waitForEffectiveSettings } from './helpers'
import { logicalDateId } from './logicalDate'
import { seedDeletedActiveGroup } from './optionsFixtures'
import {
  addRequiredGroupSections,
  createBlankGroup,
  expectVisibleGroupsStored,
  openGeneralSettings,
  openGroupActions,
  openGroupOptions,
} from './optionsPage'

test.describe('Options lockMode', () => {
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
})
