import { expect, test } from './fixtures'
import {
  addRequiredGroupSections,
  createBlankGroup,
  expectDialogCentered,
  expectVisibleGroupsStored,
  openGroupActions,
} from './optionsPage'

test.describe('Options groupActions', () => {
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
})
