import {
  applyGroupPauseState,
  evaluateUrl,
  formatRemainingMinutesBadge,
  getMinimumRemainingTimeLimit,
  getRedirectUrls,
  incrementCounters,
  normalizeCounters,
  shouldSkipUrl,
  type UrlEvaluation,
} from '@/utils/blocking'
import { reconcileEffectiveSettings } from '@/utils/effectiveSettings'
import { buildPageOpenNotificationPlan, buildRedirectBlockNotificationPlan, buildRemainingTimeNotificationPlans, markNotificationPlanHistory } from '@/utils/notifications'
import { loadBlockNotificationHistory, loadCounters, loadEffectiveSettingsState, loadGroupPauseState, loadPageOpenNotificationHistory, loadSettings, loadUsageNotificationHistory, saveBlockNotificationHistory, saveCounters, saveEffectiveSettingsState, saveGroupPauseState, savePageOpenNotificationHistory, saveUsageNotificationHistory } from '@/utils/storage'
import type { BlockNotificationHistoryState, GroupPauseState, PageOpenNotificationHistoryState, Settings, UsageCountersState, UsageNotificationHistoryState } from '@/utils/types'
import type { Tabs, WebNavigation } from 'wxt/browser'

const HEARTBEAT_ALARM = 'heartbeat'
const FLUSH_INTERVAL_MS = 7_000
const TICK_INTERVAL_MS = 1_000
const IDLE_DETECTION_SECONDS = 300
const ACTION_TITLE = 'Regex URL Guard'
const BADGE_COLOR_NORMAL = '#2563eb'
const BADGE_COLOR_WARNING = '#f59e0b'
const BADGE_COLOR_BLOCKED = '#dc2626'

let settings: Settings | undefined
let counters: UsageCountersState = { counters: {} }
let groupPauseState: GroupPauseState = { groupPauseState: {} }
let usageNotificationHistory: UsageNotificationHistoryState = { usageNotificationHistory: {} }
let pageOpenNotificationHistory: PageOpenNotificationHistoryState = { pageOpenNotificationHistory: {} }
let blockNotificationHistory: BlockNotificationHistoryState = { blockNotificationHistory: {} }
let dirtyCounters = false
let initPromise: Promise<void> | undefined
let reloadPromise: Promise<void> | undefined

interface ActionTargetTab {
  /** badge を更新する tab id。 */
  id?: number
  /** badge 判定に使う URL。 */
  url?: string
}

interface ChromeActionPromiseApi {
  /** action badge に表示する文字列を設定する。 */
  setBadgeText: (details: { tabId: number, text: string }) => Promise<void>
  /** action tooltip の title を設定する。 */
  setTitle: (details: { tabId: number, title: string }) => Promise<void>
  /** action badge の背景色を設定する。 */
  setBadgeBackgroundColor: (details: { tabId: number, color: string }) => Promise<void>
}

interface ChromeNotificationsPromiseApi {
  /** Chrome notification を作成する。 */
  create: (notificationId: string, options: {
    type: 'basic'
    iconUrl: string
    title: string
    message: string
  }) => Promise<string>
}

interface ChromePromiseApi {
  /** MV3 action API。 */
  action: ChromeActionPromiseApi
  /** Chrome notifications API。 */
  notifications: ChromeNotificationsPromiseApi
}

/**
 * background が利用する設定とカウンタを初期化する。
 */
async function initializeState(): Promise<void> {
  const now = new Date()
  const preferredSettings = await loadSettings()
  const storedEffectiveState = await loadEffectiveSettingsState(preferredSettings, now)
  const nextEffectiveState = reconcileEffectiveSettings(preferredSettings, storedEffectiveState, now)
  await saveEffectiveSettingsState(nextEffectiveState)
  settings = nextEffectiveState.effectiveSettings
  counters = normalizeCounters(settings, await loadCounters(), now)
  const validGroupIds = settings.groups.map(group => group.id)
  const [pauseState, usageHistory, pageOpenHistory, blockHistory] = await Promise.all([
    loadGroupPauseState(validGroupIds, now.getTime()),
    loadUsageNotificationHistory(),
    loadPageOpenNotificationHistory(),
    loadBlockNotificationHistory(),
  ])
  groupPauseState = pauseState
  usageNotificationHistory = usageHistory
  pageOpenNotificationHistory = pageOpenHistory
  blockNotificationHistory = blockHistory
  dirtyCounters = true
  await saveGroupPauseState(groupPauseState)
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
 * メモリ上と永続化済みの counter を、同一論理日では大きい消費秒数を優先して統合する。
 */
function mergeCounters(current: UsageCountersState, stored: UsageCountersState): UsageCountersState {
  const merged: UsageCountersState = { counters: { ...stored.counters } }
  for (const [groupId, counter] of Object.entries(current.counters)) {
    const storedCounter = merged.counters[groupId]
    if (!storedCounter || storedCounter.logicalDate !== counter.logicalDate) {
      merged.counters[groupId] = counter
      continue
    }
    merged.counters[groupId] = {
      logicalDate: counter.logicalDate,
      consumedSec: Math.max(counter.consumedSec, storedCounter.consumedSec),
    }
  }
  return merged
}

/**
 * 設定変更を再読み込みし、counter を現在のグループ定義に合わせて正規化する。
 */
async function reloadSettings(): Promise<void> {
  const now = new Date()
  const preferredSettings = await loadSettings()
  const storedEffectiveState = await loadEffectiveSettingsState(preferredSettings, now)
  const nextEffectiveState = reconcileEffectiveSettings(preferredSettings, storedEffectiveState, now)
  await saveEffectiveSettingsState(nextEffectiveState)
  settings = nextEffectiveState.effectiveSettings
  counters = normalizeCounters(settings, mergeCounters(counters, await loadCounters()), now)
  groupPauseState = await loadGroupPauseState(settings.groups.map(group => group.id), now.getTime())
  await saveGroupPauseState(groupPauseState)
  dirtyCounters = true
}

/**
 * storage.local の counter 変更を background のメモリ状態へ取り込む。
 */
async function reloadCounters(): Promise<void> {
  const s = await currentSettings()
  const storedCounters = await loadCounters()
  const nextCounters = normalizeCounters(s, mergeCounters(counters, storedCounters), new Date())
  dirtyCounters = JSON.stringify(nextCounters) !== JSON.stringify(storedCounters)
  counters = nextCounters
}

/**
 * storage.local の一時停止状態を background のメモリ状態へ取り込む。
 */
async function reloadGroupPauseState(): Promise<void> {
  const s = await currentSettings()
  groupPauseState = await loadGroupPauseState(s.groups.map(group => group.id))
}

/**
 * 永続化済み counter を現在のメモリ状態へ取り込む。
 */
async function mergeStoredCounters(s: Settings, now: Date): Promise<void> {
  counters = normalizeCounters(s, mergeCounters(counters, await loadCounters()), now)
}

/**
 * 現在の active tab に対して、閾値以下になった閲覧上限付きグループを1日1回だけ通知する。
 */
async function notifyRemainingTimeIfNeeded(s: Settings, tab: ActionTargetTab, now: Date): Promise<void> {
  const plans = buildRemainingTimeNotificationPlans(s, counters, usageNotificationHistory.usageNotificationHistory, tab.url, now)
  if (plans.length === 0) return
  const chromeApi = (globalThis as unknown as { chrome: ChromePromiseApi }).chrome

  for (const plan of plans) {
    await chromeApi.notifications.create(plan.notificationId, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: ACTION_TITLE,
      message: plan.message,
    })
    markNotificationPlanHistory(plan, usageNotificationHistory.usageNotificationHistory)
  }
  await saveUsageNotificationHistory(usageNotificationHistory)
}

/**
 * 閲覧上限付き対象ページを開いたとき、同じ論理日・同じグループでは1回だけ通知する。
 */
async function notifyPageOpenIfNeeded(s: Settings, evaluation: UrlEvaluation, now: Date): Promise<void> {
  const plan = buildPageOpenNotificationPlan(s, counters, pageOpenNotificationHistory.pageOpenNotificationHistory, evaluation, now)
  if (!plan) return
  const chromeApi = (globalThis as unknown as { chrome: ChromePromiseApi }).chrome
  await chromeApi.notifications.create(plan.notificationId, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: ACTION_TITLE,
    message: plan.message,
  })

  markNotificationPlanHistory(plan, pageOpenNotificationHistory.pageOpenNotificationHistory)
  await savePageOpenNotificationHistory(pageOpenNotificationHistory)
}

/**
 * redirect によるブロック発動時、同じ論理日・同じグループでは1回だけ通知する。
 */
async function notifyRedirectBlockIfNeeded(s: Settings, evaluation: UrlEvaluation, destinationUrl: string, now: Date): Promise<void> {
  const plan = buildRedirectBlockNotificationPlan(s, blockNotificationHistory.blockNotificationHistory, evaluation, destinationUrl, now)
  if (!plan) return
  const chromeApi = (globalThis as unknown as { chrome: ChromePromiseApi }).chrome
  await chromeApi.notifications.create(plan.notificationId, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: ACTION_TITLE,
    message: plan.message,
  })

  markNotificationPlanHistory(plan, blockNotificationHistory.blockNotificationHistory)
  await saveBlockNotificationHistory(blockNotificationHistory)
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
  const blockedGroupIds = new Set(evaluation.blockedGroupIds)
  const firstBlockedGroup = s.groups.find(group => blockedGroupIds.has(group.id))
  if (!firstBlockedGroup || firstBlockedGroup.blockAction === 'blockedPage') {
    return buildBlockedPageUrl(url, evaluation)
  }
  return firstBlockedGroup.redirectUrl
}

/**
 * redirect 直前の安全確認を行ったうえでタブをブロック先へ遷移する。
 */
async function redirectTab(tabId: number, url: string | undefined, s: Settings, evaluation: UrlEvaluation, now = new Date()): Promise<void> {
  if (!url || shouldSkipUrl(url, getRedirectUrls(s))) return
  const destinationUrl = buildBlockDestinationUrl(url, s, evaluation)
  if (getRedirectUrls(s).includes(destinationUrl)) {
    await notifyRedirectBlockIfNeeded(s, evaluation, destinationUrl, now)
  }
  await browser.tabs.update(tabId, { url: destinationUrl })
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

  const chromeApi = (globalThis as unknown as { chrome: ChromePromiseApi }).chrome
  await Promise.all([
    chromeApi.action.setBadgeText({ tabId: tab.id, text: next.text }),
    chromeApi.action.setTitle({ tabId: tab.id, title: next.title }),
    chromeApi.action.setBadgeBackgroundColor({ tabId: tab.id, color: next.color }),
  ])
}

/**
 * 指定タブの URL を評価し、ブロック対象ならリダイレクトする。
 */
async function reevaluateTab(tab: Tabs.Tab, now = new Date()): Promise<void> {
  if (typeof tab.id !== 'number') return
  const s = await currentSettings()
  await updateActionForTab(tab, now)
  const evaluation = applyGroupPauseState(evaluateUrl(s, counters, tab.url, now), groupPauseState, now.getTime())
  if (!evaluation.blocked) return
  await redirectTab(tab.id, tab.url, s, evaluation, now)
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

  const now = new Date()
  if (idleState === 'active') {
    const nextCounters = incrementCounters(s, counters, activeTab.url, now, 1)
    if (JSON.stringify(nextCounters) !== JSON.stringify(counters)) {
      counters = nextCounters
      dirtyCounters = true
    }
  }

  await notifyRemainingTimeIfNeeded(s, activeTab, now)
  await reevaluateTab(activeTab, now)
}

/**
 * webNavigation イベントの URL を先回り評価してリダイレクトする。
 */
async function handleNavigation(details: WebNavigation.OnBeforeNavigateDetailsType | WebNavigation.OnHistoryStateUpdatedDetailsType): Promise<void> {
  if (details.frameId !== 0) return
  const s = await currentSettings()
  const now = new Date()
  await mergeStoredCounters(s, now)
  const evaluation = applyGroupPauseState(evaluateUrl(s, counters, details.url, now), groupPauseState, now.getTime())
  await updateActionForTab({ id: details.tabId, url: details.url }, now)
  await notifyPageOpenIfNeeded(s, evaluation, now)
  if (!evaluation.blocked) return
  await redirectTab(details.tabId, details.url, s, evaluation, now)
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

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    if (!changes.counters && !changes.groupPauseState) return
    runAsync(async () => {
      if (changes.counters) await reloadCounters()
      if (changes.groupPauseState) await reloadGroupPauseState()
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
      const now = new Date()
      await updateActionForTab({ ...tab, id: tabId, url }, now)
      const evaluation = applyGroupPauseState(evaluateUrl(s, counters, url, now), groupPauseState, now.getTime())
      await notifyPageOpenIfNeeded(s, evaluation, now)
      if (!evaluation.blocked) return
      await redirectTab(tabId, url, s, evaluation, now)
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
      reloadPromise = reloadSettings()
      try {
        await reloadPromise
      }
      finally {
        reloadPromise = undefined
      }
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
})
