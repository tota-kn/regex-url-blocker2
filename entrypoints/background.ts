import { browser } from 'wxt/browser'
import { flushIfDirty, getSettingsCache, hydrate, registerSuspendFlush, updateGroups, updateSettings } from '@/utils/bg-state'
import { evaluateAllOpenTabs, evaluateAndRedirectTab } from '@/utils/bg-redirect'
import { getActiveTabId, isEligibleToTick, onSecondTick, setActiveTab, setFocused, setIdleState } from '@/utils/bg-tick'

export default defineBackground(() => {
  // ── 起動時ハイドレーション ──────────────────────────────────────────
  hydrate()
  registerSuspendFlush()

  // ── フォーカス変更 ───────────────────────────────────────────────────
  browser.windows.onFocusChanged.addListener((windowId) => {
    setFocused(windowId !== browser.windows.WINDOW_ID_NONE)
  })

  // ── アクティブタブ変更 ───────────────────────────────────────────────
  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await browser.tabs.get(tabId)
    setActiveTab(tab.url ?? null, tabId)
    if (tab.url) await evaluateAndRedirectTab(tabId, tab.url)
  })

  // ── タブ URL 更新（SPA の popstate 以外） ────────────────────────────
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url) return
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (activeTab?.id === tabId) setActiveTab(changeInfo.url, tabId)
    if (tab.url) await evaluateAndRedirectTab(tabId, tab.url)
  })

  // ── SPA pushState 対応 ───────────────────────────────────────────────
  browser.webNavigation.onHistoryStateUpdated.addListener(async ({ tabId, url, frameId }) => {
    if (frameId !== 0) return
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (activeTab?.id === tabId) setActiveTab(url, tabId)
    await evaluateAndRedirectTab(tabId, url)
  })

  // ── 新規ナビゲーション（先回りブロック） ─────────────────────────────
  browser.webNavigation.onBeforeNavigate.addListener(async ({ tabId, url, frameId }) => {
    if (frameId !== 0) return
    await evaluateAndRedirectTab(tabId, url)
  })

  // ── idle 状態変更 ────────────────────────────────────────────────────
  browser.idle.onStateChanged.addListener((state) => {
    setIdleState(state as 'active' | 'idle' | 'locked')
  })
  browser.idle.setDetectionInterval(300)

  // ── storage 変更（sync）→ グループ・設定の再読み込み ─────────────────
  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return
    if (changes['groups']?.newValue !== undefined) {
      updateGroups(changes['groups'].newValue as Parameters<typeof updateGroups>[0])
      await evaluateAllOpenTabs()
    }
    if (changes['settings']?.newValue !== undefined) {
      updateSettings(changes['settings'].newValue as Parameters<typeof updateSettings>[0])
    }
  })

  // ── heartbeat アラーム（全タブ再評価 + flush） ───────────────────────
  browser.alarms.create('heartbeat', { periodInMinutes: 1 })
  browser.alarms.create('tick-keepalive', { periodInMinutes: 1 })

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'heartbeat') {
      await evaluateAllOpenTabs()
      await flushIfDirty()
    }
  })

  // ── 2 秒ごとの flush ─────────────────────────────────────────────────
  setInterval(() => {
    flushIfDirty()
  }, 2000)

  // ── 毎秒ティック ─────────────────────────────────────────────────────
  setInterval(() => {
    const now = new Date()
    const shouldRedirect = onSecondTick(now)
    if (shouldRedirect && isEligibleToTick()) {
      const tabId = getActiveTabId()
      const settings = getSettingsCache()
      if (tabId !== null) {
        browser.tabs.update(tabId, { url: settings.redirectUrl })
      }
    }
  }, 1000)

  // ── 起動時のアクティブタブ取得 ──────────────────────────────────────
  browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
    const tab = tabs[0]
    if (tab?.id !== undefined && tab.url) {
      setActiveTab(tab.url, tab.id)
    }
  })

  browser.windows.getLastFocused().then((win) => {
    setFocused(win.focused)
  })
})
