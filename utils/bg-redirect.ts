import { browser } from 'wxt/browser'
import { ready, getAccumulatorsCache, getGroupsCache, getSettingsCache } from '@/utils/bg-state'
import { decideUrlBlock } from '@/utils/block-decision'

/**
 * 指定タブの URL をブロック判定し、必要なら redirectUrl へ遷移させる。
 * ハイドレーション完了を待ってから実行する。
 */
export async function evaluateAndRedirectTab(tabId: number, url: string): Promise<void> {
  await ready
  const settings = getSettingsCache()
  const groups = getGroupsCache()
  const accumulators = getAccumulatorsCache()
  const now = new Date()

  const decision = decideUrlBlock(url, groups, accumulators, now, settings.redirectUrl)
  if (decision.blocked) {
    await browser.tabs.update(tabId, { url: settings.redirectUrl })
  }
}

/**
 * 現在開いているすべてのタブを再評価し、ブロック対象をリダイレクトする。
 */
export async function evaluateAllOpenTabs(): Promise<void> {
  await ready
  const tabs = await browser.tabs.query({})
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.url) {
      await evaluateAndRedirectTab(tab.id, tab.url)
    }
  }
}
