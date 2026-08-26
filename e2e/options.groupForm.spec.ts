import { expect, test } from './fixtures'
import {
  addRequiredGroupSections,
  createBlankGroup,
  expectVisibleGroupsStored,
  openGroupOptions,
} from './optionsPage'

test.describe('Options groupForm', () => {
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
    const pauseRadios = optionsPanel
      .locator('fieldset[aria-label="Pause settings"]')
      .getByRole('radio')
    await expect(pauseRadios.nth(0)).toHaveAttribute('aria-label', 'Allow Pause Off')
    await expect(pauseRadios.nth(1)).toHaveAttribute('aria-label', 'Allow Pause On')
    await expect(pauseRadios.nth(0)).toBeChecked()
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
    const viewOptions = page
      .locator('main section')
      .filter({ has: page.getByRole('heading', { name: 'Options' }) })
    const optionRows = viewOptions.locator('dl > div')
    await expect(optionRows).toHaveCount(1)
    await expect(optionRows.nth(0)).toContainText(
      'Delay relaxed restrictions until next rule dayOn',
    )
    await expect(viewOptions.getByText('Pause', { exact: true })).toHaveCount(0)
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

  test('オフの Options は View Mode に表示しない', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await createBlankGroup(page)
    await page.getByLabel('Name').fill('Options off')
    await addRequiredGroupSections(page)
    await openGroupOptions(page)
    await expect(
      page.getByRole('radio', { name: 'Delay relaxed restrictions until next rule day Off' }),
    ).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Allow Pause Off' })).toBeChecked()
    await page.getByRole('button', { name: 'Save group' }).click()

    await expect(page.locator('main').getByRole('heading', { name: 'Options' })).toHaveCount(0)
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
    const displayedRule = page.getByLabel('Rule 1')
    const [scheduleBox, actionBox] = await Promise.all([
      displayedRule.locator('[data-rule-part="schedule"]').boundingBox(),
      displayedRule.locator('[data-rule-part="action"]').boundingBox(),
    ])
    expect(actionBox!.y).toBeGreaterThan(scheduleBox!.y)
    await expect(page.getByLabel('Active time ranges')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add rule' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Add rule' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Add URL pattern' })).not.toBeVisible()
  })
})
