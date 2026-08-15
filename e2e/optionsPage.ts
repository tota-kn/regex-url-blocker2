import { expect, type Locator, type Page } from '@playwright/test'

/** Options 画面の General settings セクションを開く。 */
export async function openGeneralSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: /General settings/ }).click()
}

/** ダイアログがビューポート中央に表示されていることを検証する。 */
export async function expectDialogCentered(page: Page, dialog: Locator): Promise<void> {
  const box = await dialog.boundingBox()
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }))

  expect(box).not.toBeNull()
  expect(box!.x + box!.width / 2).toBeCloseTo(viewport.width / 2, 0)
  expect(box!.y + box!.height / 2).toBeCloseTo(viewport.height / 2, 0)
}

/** 指定した要素で不要な水平スクロールが発生していないことを検証する。 */
export async function expectNoHorizontalOverflow(locator: Locator): Promise<void> {
  const overflow = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

/** 空テンプレートから新規グループドラフトを作成する。 */
export async function createBlankGroup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add group' }).click()
  await page.getByRole('button', { name: 'Create blank group' }).click()
}

/** グループ保存に必須の URL pattern・time window・restriction を最小構成で追加する。 */
export async function addRequiredGroupSections(page: Page, pattern = 'example.com'): Promise<void> {
  await page.getByRole('button', { name: 'Add URL pattern' }).click()
  await page.getByRole('textbox', { name: 'URL pattern' }).last().fill(pattern)
  await page.getByRole('button', { name: 'Add rule' }).last().click()
}

/** 編集中グループの Options disclosure を開く。 */
export async function openGroupOptions(page: Page): Promise<void> {
  await page.locator('main').getByRole('button', { name: 'Options' }).last().click()
}

/** グループカードのアクションメニューを開く。 */
export async function openGroupActions(scope: Page | Locator): Promise<void> {
  await scope.getByRole('button', { name: 'Group actions' }).first().click()
}

/** Options の debounce 保存が storage.sync に反映されるまで待つ。 */
export async function expectGlobalSettingsStored(
  page: Page,
  expected: Record<string, unknown>,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        return (await globalThis.chrome.storage.sync.get('global')).global
      }),
    )
    .toEqual(expect.objectContaining(expected))
}

/** 画面上の保存済み group 一覧が storage.sync と一致するまで待つ。 */
export async function expectVisibleGroupsStored(page: Page): Promise<void> {
  const names = await page
    .getByLabel('Name')
    .evaluateAll((inputs) =>
      inputs
        .filter((input) => (input as HTMLInputElement).disabled)
        .map((input) => (input as HTMLInputElement).value),
    )
  await expect
    .poll(() =>
      page.evaluate(async () => {
        return (
          (await globalThis.chrome.storage.sync.get('groups')).groups?.map(
            (group: { name: string }) => group.name,
          ) ?? []
        )
      }),
    )
    .toEqual(names)
}
