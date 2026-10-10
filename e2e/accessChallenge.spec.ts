import {
  gotoAndWaitForUrl,
  startTestServer,
  setExtensionStorage,
  waitForEffectiveSettings,
} from './helpers'
import { buildGroupFixture, buildSettingsFixture } from './settingsFixture'
import type { AccessChallenge } from '../utils/types'
import { expect, test } from './fixtures'
import { createBlankGroup, addRequiredGroupSections } from './optionsPage'

test('文字入力の初期値と変更値を保存する', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await createBlankGroup(page)
  await addRequiredGroupSections(page)
  await page.getByLabel('Rule 1 restriction', { exact: true }).selectOption('wait')
  await page.getByLabel('Access task', { exact: true }).selectOption('typing')
  await expect(page.getByLabel('String length', { exact: true })).toHaveValue('12')
  await expect(page.getByLabel('String count', { exact: true })).toHaveValue('5')
  await page.getByLabel('String length', { exact: true }).fill('16')
  await page.getByLabel('String count', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Save group' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await globalThis.chrome.storage.sync.get('groups')).groups?.[0]?.rules?.[0]?.restriction
            ?.challenge,
      ),
    )
    .toMatchObject({ type: 'typing', length: 16, count: 6 })
  await page.reload()
  await page.getByRole('button', { name: 'Edit group' }).click()
  await expect(page.getByLabel('Access task', { exact: true })).toHaveValue('typing')
  await expect(page.getByLabel('String length', { exact: true })).toHaveValue('16')
  await expect(page.getByLabel('String count', { exact: true })).toHaveValue('6')
})

test('文字列は一致する入力を5回完了するまで続行できない', async ({ page, extensionId }) => {
  const params = new URLSearchParams({
    url: 'https://example.com',
    group: 'task',
    seconds: '0',
    challenges: JSON.stringify([{ type: 'typing', length: 12, count: 5 }]),
  })
  await page.goto(`chrome-extension://${extensionId}/wait.html?${params}`)
  const proceed = page.getByRole('button', { name: 'Continue', exact: true })
  await expect(proceed).toBeDisabled()
  await page.getByLabel('Enter the string', { exact: true }).fill('incorrect')
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(page.getByText('Strings remaining: 5')).toBeVisible()
  for (let index = 0; index < 5; index++) {
    const text = await page.getByLabel('String to enter', { exact: true }).innerText()
    expect(text).toHaveLength(12)
    await page.getByLabel('Enter the string', { exact: true }).fill(text)
    await page.getByRole('button', { name: 'Check', exact: true }).click()
  }
  await expect(proceed).toBeEnabled()
})

test('文字入力の設定で対象サイトから操作画面へ移動し、完了後に遷移する', async ({
  page,
  serviceWorker,
  extensionId,
}) => {
  const server = await startTestServer()
  try {
    const challenge: AccessChallenge = { type: 'typing', length: 12, count: 1 }
    await setExtensionStorage(
      serviceWorker,
      'sync',
      buildSettingsFixture([
        buildGroupFixture({
          id: 'task',
          name: 'Task',
          patterns: [server.origin],
          rules: [
            {
              id: 'task-rule',
              window: { type: 'always' },
              restriction: { kind: 'wait', seconds: 60, grantMinutes: 10, challenge },
            },
          ],
        }),
      ]),
    )
    await waitForEffectiveSettings(serviceWorker)
    await gotoAndWaitForUrl(
      page,
      `${server.origin}/target`,
      new RegExp(`^chrome-extension://${extensionId}/wait\\.html`),
    )
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
    const value = await page.getByLabel('String to enter', { exact: true }).innerText()
    await page.getByLabel('Enter the string', { exact: true }).fill(value)
    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL(`${server.origin}/target`)
    await page.reload()
    await expect(page).toHaveURL(`${server.origin}/target`)
  } finally {
    await server.close()
  }
})
