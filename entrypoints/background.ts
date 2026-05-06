import {
  evaluateUrl,
  formatRemainingMinutesBadge,
  getMinimumRemainingTimeLimit,
  incrementCounters,
  normalizeCounters,
  shouldSkipUrl,
  type UrlEvaluation,
} from '@/utils/blocking'
import { loadCounters, loadSettings, saveCounters } from '@/utils/storage'
import type { Settings, UsageCountersState } from '@/utils/types'
import type { Tabs, WebNavigation } from 'wxt/browser'

const HEARTBEAT_ALARM = 'heartbeat'
const FLUSH_INTERVAL_MS = 7_000
const TICK_INTERVAL_MS = 1_000
const IDLE_DETECTION_SECONDS = 300
const ACTION_TITLE = 'Regex URL Blocker'
const BADGE_COLOR_NORMAL = '#2563eb'
const BADGE_COLOR_WARNING = '#f59e0b'
const BADGE_COLOR_BLOCKED = '#dc2626'

let settings: Settings | undefined
let counters: UsageCountersState = { counters: {} }
let dirtyCounters = false
let initPromise: Promise<void> | undefined
let reloadPromise: Promise<void> | undefined
const actionStateByTabId = new Map<number, { text: string, title: string, color: string }>()

interface ActionTargetTab {
  /** badge を更新する tab id。 */
  id?: number
  /** badge 判定に使う URL。 */
  url?: string
}

interface ChromeActionApi {
  /** action badge に表示する文字列を設定する。 */
  setBadgeText: (details: { tabId: number, text: string }, callback?: () => void) => void
  /** action tooltip の title を設定する。 */
  setTitle: (details: { tabId: number, title: string }, callback?: () => void) => void
  /** action badge の背景色を設定する。 */
  setBadgeBackgroundColor: (details: { tabId: number, color: string }, callback?: () => void) => void
}

interface ChromeRuntimeApi {
  /** callback 型 API の直近エラー。 */
  lastError?: { message?: string }
}

interface ChromeApi {
  /** MV3 action API。 */
  action: ChromeActionApi
  /** Runtime API。 */
  runtime: ChromeRuntimeApi
}

/**
 * background が利用する設定とカウンタを初期化する。
 */
async function initializeState(): Promise<void> {
  settings = await loadSettings()
  counters = normalizeCounters(settings, await loadCounters(), new Date())
  dirtyCounters = true
  await flushCounters()
}

/**
 * 初期化処理を多重実行しないための Promise を返す。
 */
function ensureInitialized(): Promise<void> {
  initPromise ??= initializeState()
  return initPromise
}

/**
 * 現在の設定を返す。未初期化の場合は初期化してから返す。
 */
async function currentSettings(): Promise<Settings> {
  await ensureInitialized()
  await reloadPromise
  if (!settings) {
    throw new Error('Settings are not initialized')
  }
  return settings
}

/**
 * dirty な counter を storage.local へ保存する。
 */
async function flushCounters(): Promise<void> {
  if (!dirtyCounters) return
  await saveCounters(counters)
  dirtyCounters = false
}

/**
 * 設定変更を再読み込みし、counter を現在のグループ定義に合わせて正規化する。
 */
async function reloadSettings(): Promise<void> {
  settings = await loadSettings()
  counters = normalizeCounters(settings, counters, new Date())
  dirtyCounters = true
  await flushCounters()
}

/**
 * 拡張機能のブロックページ URL を作る。
 */
function buildBlockedPageUrl(url: string, evaluation: UrlEvaluation): string {
  const target = new URL(`chrome-extension://${browser.runtime.id}/blocked.html`)
  target.searchParams.set('url', url)
  for (const groupId of evaluation.blockedGroupIds) {
    target.searchParams.append('group', groupId)
  }
  return target.toString()
}

/**
 * ブロック時にタブを書き換える遷移先 URL を作る。
 */
function buildBlockDestinationUrl(url: string, s: Settings, evaluation: UrlEvaluation): string {
  if (s.global.blockAction === 'blockedPage') {
    return buildBlockedPageUrl(url, evaluation)
  }
  return s.global.redirectUrl
}

/**
 * redirect 直前の安全確認を行ったうえでタブをブロック先へ遷移する。
 */
async function redirectTab(tabId: number, url: string | undefined, s: Settings, evaluation: UrlEvaluation): Promise<void> {
  if (!url || shouldSkipUrl(url, s.global.redirectUrl)) return
  await browser.tabs.update(tabId, { url: buildBlockDestinationUrl(url, s, evaluation) })
}

/**
 * 残り秒数に応じた badge 背景色を返す。
 */
function badgeColor(remainingSec: number): string {
  if (remainingSec <= 0) return BADGE_COLOR_BLOCKED
  if (remainingSec <= 5 * 60) return BADGE_COLOR_WARNING
  return BADGE_COLOR_NORMAL
}

/**
 * タブに表示すべき action badge/title 状態を作る。
 */
function buildActionState(s: Settings, tab: ActionTargetTab, now: Date): { text: string, title: string, color: string } {
  const minimum = getMinimumRemainingTimeLimit(s, counters, tab.url, now)
  if (!minimum) {
    return { text: '', title: ACTION_TITLE, color: BADGE_COLOR_NORMAL }
  }

  const text = formatRemainingMinutesBadge(minimum.summary.remainingSec)
  return {
    text,
    title: `${ACTION_TITLE} - remaining ${text}`,
    color: badgeColor(minimum.summary.remainingSec),
  }
}

/**
 * 指定タブの action badge/title を現在の判定結果に合わせて更新する。
 */
async function updateActionForTab(tab: ActionTargetTab, now = new Date()): Promise<void> {
  if (typeof tab.id !== 'number') return
  const s = await currentSettings()
  const next = buildActionState(s, tab, now)
  const current = actionStateByTabId.get(tab.id)
  if (current?.text === next.text && current.title === next.title && current.color === next.color) return

  const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome
  await Promise.all([
    setActionBadgeText(chromeApi, tab.id, next.text),
    setActionTitle(chromeApi, tab.id, next.title),
    setActionBadgeBackgroundColor(chromeApi, tab.id, next.color),
  ])
  actionStateByTabId.set(tab.id, next)
}

/**
 * callback 型の chrome.action API を Promise として扱う。
 */
function actionCallbackPromise(chromeApi: ChromeApi, executor: (callback: () => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    executor(() => {
      const message = chromeApi.runtime.lastError?.message
      if (message) reject(new Error(message))
      else resolve()
    })
  })
}

/**
 * action badge の文字列を設定する。
 */
function setActionBadgeText(chromeApi: ChromeApi, tabId: number, text: string): Promise<void> {
  return actionCallbackPromise(chromeApi, callback => chromeApi.action.setBadgeText({ tabId, text }, callback))
}

/**
 * action title を設定する。
 */
function setActionTitle(chromeApi: ChromeApi, tabId: number, title: string): Promise<void> {
  return actionCallbackPromise(chromeApi, callback => chromeApi.action.setTitle({ tabId, title }, callback))
}

/**
 * action badge の背景色を設定する。
 */
function setActionBadgeBackgroundColor(chromeApi: ChromeApi, tabId: number, color: string): Promise<void> {
  return actionCallbackPromise(chromeApi, callback => chromeApi.action.setBadgeBackgroundColor({ tabId, color }, callback))
}

/**
 * 指定タブの URL を評価し、ブロック対象ならリダイレクトする。
 */
async function reevaluateTab(tab: Tabs.Tab, now = new Date()): Promise<void> {
  if (typeof tab.id !== 'number') return
  const s = await currentSettings()
  await updateActionForTab(tab, now)
  const evaluation = evaluateUrl(s, counters, tab.url, now)
  if (!evaluation.blocked) return
  await redirectTab(tab.id, tab.url, s, evaluation)
}

/**
 * すべての既存タブを再評価する。
 */
async function reevaluateAllTabs(): Promise<void> {
  const tabs = await browser.tabs.query({})
  await Promise.all(tabs.map(tab => reevaluateTab(tab)))
}

/**
 * フォーカス中 window の active tab を返す。
 */
async function getFocusedActiveTab(): Promise<Tabs.Tab | undefined> {
  const focusedWindow = await browser.windows.getLastFocused()
  if (!focusedWindow.focused || typeof focusedWindow.id !== 'number') return undefined
  const [tab] = await browser.tabs.query({ active: true, windowId: focusedWindow.id })
  return tab
}

/**
 * 1秒ごとの閲覧時間加算と active tab 再評価を行う。
 */
async function tick(): Promise<void> {
  const s = await currentSettings()
  const idleState = await browser.idle.queryState(IDLE_DETECTION_SECONDS)
  const activeTab = await getFocusedActiveTab()
  if (!activeTab) return

  if (idleState === 'active') {
    const nextCounters = incrementCounters(s, counters, activeTab.url, new Date(), 1)
    if (JSON.stringify(nextCounters) !== JSON.stringify(counters)) {
      counters = nextCounters
      dirtyCounters = true
    }
  }

  await reevaluateTab(activeTab)
}

/**
 * webNavigation イベントの URL を先回り評価してリダイレクトする。
 */
async function handleNavigation(details: WebNavigation.OnBeforeNavigateDetailsType | WebNavigation.OnHistoryStateUpdatedDetailsType): Promise<void> {
  if (details.frameId !== 0) return
  const s = await currentSettings()
  const evaluation = evaluateUrl(s, counters, details.url, new Date())
  await updateActionForTab({ id: details.tabId, url: details.url })
  if (!evaluation.blocked) return
  await redirectTab(details.tabId, details.url, s, evaluation)
}

/**
 * Promise を返す処理をイベントリスナーから安全に呼び出す。
 */
function runAsync(task: () => Promise<void>): void {
  void task().catch((error: unknown) => {
    console.error(error)
  })
}

export default defineBackground(() => {
  runAsync(async () => {
    await ensureInitialized()
    browser.idle.setDetectionInterval(IDLE_DETECTION_SECONDS)
    await browser.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 })
  })

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return
    if (!changes.global && !changes.groups) return
    runAsync(async () => {
      reloadPromise = reloadSettings()
      try {
        await reloadPromise
      }
      finally {
        reloadPromise = undefined
      }
      await reevaluateAllTabs()
    })
  })

  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    runAsync(async () => handleNavigation(details))
  })

  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    runAsync(async () => handleNavigation(details))
  })

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url ?? tab.url
    if (!url) return
    runAsync(async () => {
      const s = await currentSettings()
      await updateActionForTab({ ...tab, id: tabId, url })
      const evaluation = evaluateUrl(s, counters, url, new Date())
      if (!evaluation.blocked) return
      await redirectTab(tabId, url, s, evaluation)
    })
  })

  browser.tabs.onActivated.addListener((activeInfo) => {
    runAsync(async () => {
      const tab = await browser.tabs.get(activeInfo.tabId)
      await reevaluateTab(tab)
    })
  })

  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === browser.windows.WINDOW_ID_NONE) return
    runAsync(async () => {
      const [tab] = await browser.tabs.query({ active: true, windowId })
      if (tab) await reevaluateTab(tab)
    })
  })

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== HEARTBEAT_ALARM) return
    runAsync(async () => {
      await reevaluateAllTabs()
      await flushCounters()
    })
  })

  browser.runtime.onSuspend.addListener(() => {
    runAsync(flushCounters)
  })

  setInterval(() => {
    runAsync(tick)
  }, TICK_INTERVAL_MS)

  setInterval(() => {
    runAsync(flushCounters)
  }, FLUSH_INTERVAL_MS)

  browser.tabs.onRemoved.addListener((tabId) => {
    actionStateByTabId.delete(tabId)
  })
})
