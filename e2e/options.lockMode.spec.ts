import { expect, test } from './fixtures'
import { setExtensionStorage, waitForEffectiveSettings } from './helpers'
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
import { buildGroupFixture, buildSettingsFixture } from './settingsFixture'

/** Lock Mode テスト用の常時ブロックルールを生成する。 */
function blockRule(id: string, destinationUrl?: string) {
  return {
    id,
    window: { type: 'always' } as const,
    restriction: { kind: 'block' } as const,
    destination: destinationUrl
      ? ({ type: 'redirect', url: destinationUrl } as const)
      : ({ type: 'blockedPage' } as const),
  }
}

/** Lock Mode テスト用の常時閲覧上限ルールを生成する。 */
function dailyLimitRule(id: string, minutes: number, url: string) {
  return {
    id,
    window: { type: 'always' } as const,
    restriction: { kind: 'dailyLimit', minutes } as const,
    destination: { type: 'redirect', url } as const,
  }
}

test.describe('Options lockMode', () => {
  test('保留中は希望設定と以前から適用中の内容をフィールドごとに示す', async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    await waitForEffectiveSettings(serviceWorker)
    const otherGroup = buildGroupFixture({ id: 'other', name: 'Other' })
    const activeSettings = buildSettingsFixture(
      [
        buildGroupFixture({
          id: 'work',
          name: 'Work',
          lockMode: true,
          patterns: ['active\\.example'],
          rules: [dailyLimitRule('active-limit', 10, 'https://active-blocked.test')],
        }),
        otherGroup,
      ],
      { dailyResetHour: '03:00' },
    )
    const preferredSettings = buildSettingsFixture(
      [
        buildGroupFixture({
          id: 'work',
          name: 'Work',
          lockMode: true,
          patterns: ['preferred\\.example'],
          rules: [dailyLimitRule('preferred-limit', 30, 'https://preferred-blocked.test')],
        }),
        otherGroup,
      ],
      { dailyResetHour: '05:00' },
    )
    await setExtensionStorage(serviceWorker, 'local', {
      effectiveSettings: activeSettings,
      effectiveSettingsLogicalDate: logicalDateId(new Date(), '03:00'),
    })
    await setExtensionStorage(serviceWorker, 'sync', preferredSettings)

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
    await expect(page.getByText(/Earlier URL patterns stay active until /)).toBeVisible()
    const earlierPatterns = page.getByLabel('Earlier URL patterns currently active')
    await expect(earlierPatterns).toContainText('active\\.example')
    await expect(earlierPatterns).not.toContainText('preferred\\.example')
    await expect(page.getByText(/Earlier rules stay active until /)).toBeVisible()
    const earlierRules = page.getByLabel('Earlier rules currently active')
    await expect(earlierRules.getByLabel('Earlier rule 1')).toContainText('Allow 10 min per day')
    await expect(earlierRules.getByLabel('Earlier rule 1')).toContainText(
      'https://active-blocked.test',
    )
    await expect(earlierRules).not.toContainText('Allow 30 min per day')
    // 保留状況はグループ全体のバナーや別ダイアログに重複表示しない。
    await expect(page.getByText('Earlier restrictions are still active.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View active settings' })).toHaveCount(0)
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
    const settings = buildSettingsFixture(
      [
        buildGroupFixture({
          id: 'locked-disable',
          name: 'Locked disable',
          lockMode: true,
          patterns: ['example\\.com'],
          rules: [blockRule('locked-disable-rule')],
        }),
      ],
      { dailyResetHour: '03:00' },
    )
    await setExtensionStorage(serviceWorker, 'local', {
      effectiveSettings: settings,
      effectiveSettingsLogicalDate: logicalDateId(new Date(), '03:00'),
    })
    await setExtensionStorage(serviceWorker, 'sync', settings)
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
    const activeSettings = buildSettingsFixture(
      [
        buildGroupFixture({
          id: 'deleted-active',
          name: 'Deleted active',
          lockMode: true,
          patterns: ['deleted\\.example'],
          rules: [blockRule('deleted-active-rule', 'https://active-blocked.test')],
        }),
      ],
      { dailyResetHour: '03:00' },
    )
    await setExtensionStorage(serviceWorker, 'sync', activeSettings)
    await waitForEffectiveSettings(serviceWorker)
    await serviceWorker.evaluate(async () => {
      await globalThis.chrome.storage.sync.set({ groups: [] })
    })
    await expect
      .poll(async () => {
        return serviceWorker.evaluate(async () => {
          return (await globalThis.chrome.storage.local.get('effectiveSettings')).effectiveSettings
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
