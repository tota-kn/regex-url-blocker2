import {
  applyDelayGrantState,
  applyGroupPauseState,
  countersEqual,
  evaluateEffectiveUrl,
  getBlockDestination,
  getBlockReason,
  getEffectiveWait,
  getRedirectUrls,
  isTargetGroup,
  incrementEffectiveCounters,
  normalizeCounters,
  shouldSkipUrl,
  strictestBlockReason,
  type BlockReason,
  type UrlEvaluation,
} from '@/utils/blocking'
import { ACTION_TITLE, buildActionState } from '@/utils/actionBadge'
import { buildBlockedPageUrl, buildWaitPageUrl } from '@/utils/extensionUrls'
import { reconcileEffectiveSettings } from '@/utils/effectiveSettings'
import { getPauseAllowedGroupIds } from '@/utils/groupPause'
import { jsonEqual } from '@/utils/json'
import { bothSettings, settingsPair, unionOf, type SettingsPair } from '@/utils/settingsPair'
import {
  buildEffectiveRemainingTimeNotificationPlans,
  markNotificationPlanHistory,
} from '@/utils/notifications'
import {
  loadCounters,
  loadDelayGrantState,
  loadEffectiveSettingsState,
  loadGroupPauseState,
  loadSettings,
  loadUsageNotificationHistory,
  removeObsoleteLocalState,
  saveCounters,
  saveEffectiveSettingsState,
  saveGroupPauseState,
  saveUsageNotificationHistory,
} from '@/utils/storage'
import type {
  DelayGrantState,
  GroupPauseState,
  Settings,
  UsageCountersState,
  UsageNotificationHistoryState,
} from '@/utils/types'
import type { Tabs, WebNavigation } from 'wxt/browser'

const HEARTBEAT_ALARM = 'heartbeat'
const FLUSH_INTERVAL_MS = 7_000
const TICK_INTERVAL_MS = 1_000
const IDLE_DETECTION_SECONDS = 300

let settings: Settings | undefined
let preferredSettings: Settings | undefined
let counters: UsageCountersState = { counters: {} }
let groupPauseState: GroupPauseState = { groupPauseState: {} }
let delayGrantState: DelayGrantState = { delayGrantState: {} }
let usageNotificationHistory: UsageNotificationHistoryState = { usageNotificationHistory: {} }
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
  setBadgeText: (details: { tabId: number; text: string }) => Promise<void>
  /** action tooltip の title を設定する。 */
  setTitle: (details: { tabId: number; title: string }) => Promise<void>
  /** action badge の背景色を設定する。 */
  setBadgeBackgroundColor: (details: { tabId: number; color: string }) => Promise<void>
}

interface ChromeNotificationsPromiseApi {
  /** Chrome notification を作成する。 */
  create: (
    notificationId: string,
    options: {
      type: 'basic'
      iconUrl: string
      title: string
      message: string
    },
  ) => Promise<string>
}

interface ChromePromiseApi {
  /** MV3 action API。 */
  action: ChromeActionPromiseApi
  /** Chrome notifications API。 */
  notifications: ChromeNotificationsPromiseApi
}

/**
 * 保存済み設定を読み直し、基準スナップショットと一時停止・待機ゲート状態を更新する。
 *
 * 起動時（`initializeState`）と設定変更時（`reloadSettings`）で共通の手順。
 * @param mergeInMemoryCounters 既にメモリ上の counter がある場合に永続値と統合するかどうか。
 *   起動直後はメモリ側が空なので false でよい。
 */
async function applyLatestSettings(now: Date, mergeInMemoryCounters: boolean): Promise<Settings> {
  const preferred = await loadSettings()
  const storedEffectiveState = await loadEffectiveSettingsState(preferred, now)
  const nextEffectiveState = reconcileEffectiveSettings(preferred, storedEffectiveState, now)
  await saveEffectiveSettingsState(nextEffectiveState)

  settings = nextEffectiveState.effectiveSettings
  preferredSettings = preferred

  const storedCounters = await loadCounters()
  counters = normalizeCounters(
    settings,
    mergeInMemoryCounters ? mergeCounters(counters, storedCounters) : storedCounters,
    now,
  )
  groupPauseState = await loadGroupPauseState(
    getPauseAllowedGroupIds(settings, preferred),
    now.getTime(),
  )
  await saveGroupPauseState(groupPauseState)
  delayGrantState = await loadDelayGrantState(
    settings.groups.map((group) => group.id),
    now.getTime(),
  )
  dirtyCounters = true
  return settings
}

/**
 * background が利用する設定とカウンタを初期化する。
 */
async function initializeState(): Promise<void> {
  await applyLatestSettings(new Date(), false)
  usageNotificationHistory = await loadUsageNotificationHistory()
  await removeObsoleteLocalState()
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

/** 基準設定と、まだ読み込めていなければ基準設定で代用した希望設定の組を返す。 */
function currentPair(s: Settings): SettingsPair {
  return settingsPair(s, preferredSettings)
}

/** 基準設定と最新設定を使って URL を評価する。 */
function evaluateCurrentUrl(s: Settings, url: string | undefined, now: Date): UrlEvaluation {
  const pair = currentPair(s)
  return evaluateEffectiveUrl(pair.baseline, pair.preferred, counters, url, now)
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
function mergeCounters(
  current: UsageCountersState,
  stored: UsageCountersState,
): UsageCountersState {
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
  await applyLatestSettings(new Date(), true)
}

/**
 * 設定の再読み込み中は URL 評価を待たせるため、進行中の Promise を公開しながら実行する。
 */
async function withReloadLock(task: () => Promise<void>): Promise<void> {
  reloadPromise = task()
  try {
    await reloadPromise
  } finally {
    reloadPromise = undefined
  }
}

/**
 * storage.local の counter 変更を background のメモリ状態へ取り込む。
 */
async function reloadCounters(): Promise<void> {
  const s = await currentSettings()
  const storedCounters = await loadCounters()
  const nextCounters = normalizeCounters(s, mergeCounters(counters, storedCounters), new Date())
  // 正規化でキー順が変わるだけの場合に無駄な書き戻しを起こさないよう、内容で比較する。
  dirtyCounters = !countersEqual(nextCounters, storedCounters)
  counters = nextCounters
}

/**
 * storage.local の一時停止状態を background のメモリ状態へ取り込む。
 */
async function reloadGroupPauseState(): Promise<void> {
  const pair = currentPair(await currentSettings())
  groupPauseState = await loadGroupPauseState(
    getPauseAllowedGroupIds(pair.baseline, pair.preferred),
  )
}

/**
 * storage.local の待機ゲート許可状態を background のメモリ状態へ取り込む。
 */
async function reloadDelayGrantState(): Promise<void> {
  const s = await currentSettings()
  delayGrantState = await loadDelayGrantState(s.groups.map((group) => group.id))
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
async function notifyRemainingTimeIfNeeded(
  s: Settings,
  tab: ActionTargetTab,
  now: Date,
): Promise<void> {
  const pair = currentPair(s)
  const plans = buildEffectiveRemainingTimeNotificationPlans(
    pair.baseline,
    pair.preferred,
    counters,
    usageNotificationHistory.usageNotificationHistory,
    tab.url,
    now,
  )
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
 * 拡張機能のブロックページ URL を作る。
 */
/**
 * 基準設定と最新設定の両方が指定する遷移先 URL を返す。
 * lockMode で基準側の遷移先が凍結されているとき、最新側の遷移先でループしないために union する。
 */
function allRedirectUrls(s: Settings): string[] {
  return unionOf(currentPair(s), getRedirectUrls)
}

/**
 * ブロックされたグループのうち、評価順で最も強い理由を返す。
 * 基準設定と最新設定のどちらで成立したものでも拾う。
 */
function findBlockReason(
  s: Settings,
  evaluation: UrlEvaluation,
  now: Date,
): BlockReason | undefined {
  const blockedGroupIds = new Set(evaluation.blockedGroupIds)
  const reasons = bothSettings(currentPair(s)).flatMap((item) =>
    item.groups
      .filter((group) => blockedGroupIds.has(group.id))
      .flatMap((group) => {
        const reason = getBlockReason(group, counters.counters[group.id], now, item.global)
        return reason ? [reason] : []
      }),
  )
  return strictestBlockReason(reasons)
}

/**
 * ブロック時にタブを書き換える遷移先 URL を作る。
 * ブロックを起こしたルールの `destination` に従い、ブロックページか指定 URL を返す。
 */
function buildBlockDestinationUrl(
  url: string,
  s: Settings,
  evaluation: UrlEvaluation,
  now: Date,
): string {
  const reason = findBlockReason(s, evaluation, now)
  if (!reason) return buildBlockedPageUrl({ extensionId: browser.runtime.id, url, evaluation })
  const destination = getBlockDestination(reason)
  return destination.type === 'redirect'
    ? destination.url
    : buildBlockedPageUrl({ extensionId: browser.runtime.id, url, evaluation })
}

/**
 * redirect 直前の安全確認を行ったうえでタブをブロック先へ遷移する。
 */
async function redirectTab(
  tabId: number,
  url: string | undefined,
  s: Settings,
  evaluation: UrlEvaluation,
  now = new Date(),
): Promise<void> {
  if (!url || shouldSkipUrl(url, allRedirectUrls(s))) return
  const destinationUrl = buildBlockDestinationUrl(url, s, evaluation, now)
  await browser.tabs.update(tabId, { url: destinationUrl })
}

/**
 * 待機ゲートのカウントダウンページ URL を作る。
 */
/**
 * 待機ゲート対象タブを待機ページへ遷移する。
 * 遷移直後の再リダイレクトループを避けるため、判定直前に最新の許可状態を読み込む。
 */
async function redirectToWaitIfNeeded(
  tabId: number,
  url: string | undefined,
  s: Settings,
  evaluation: UrlEvaluation,
  now = new Date(),
): Promise<void> {
  if (evaluation.delayedGroupIds.length === 0) return
  if (!url || shouldSkipUrl(url, allRedirectUrls(s))) return

  delayGrantState = await loadDelayGrantState(
    s.groups.map((group) => group.id),
    now.getTime(),
  )
  const delayed = applyDelayGrantState(evaluation, delayGrantState, now.getTime())
  const groupId = delayed.delayedGroupIds[0]
  if (!groupId) return

  // 基準設定と最新設定で待機設定が違う場合は、どちらの制限も満たすよう厳しい方を採る。
  const waits = bothSettings(currentPair(s)).flatMap((item) => {
    const group = item.groups.find((candidate) => candidate.id === groupId)
    if (!group || !isTargetGroup(group, url)) return []
    const wait = getEffectiveWait(group, now, item.global)
    return wait ? [wait] : []
  })
  if (waits.length === 0) return

  const seconds = Math.max(...waits.map((wait) => wait.seconds))
  const grantMinutes = Math.max(...waits.map((wait) => wait.grantMinutes))
  await browser.tabs.update(tabId, {
    url: buildWaitPageUrl({
      extensionId: browser.runtime.id,
      url,
      groupId,
      seconds,
      grantMinutes,
    }),
  })
}

/**
 * URL 評価結果に応じてタブをブロック先または待機ページへ遷移する。
 * ハードブロックが待機ゲートより優先される。
 */
async function enforceEvaluation(
  tabId: number,
  url: string | undefined,
  s: Settings,
  evaluation: UrlEvaluation,
  now = new Date(),
): Promise<void> {
  if (evaluation.blocked) {
    await redirectTab(tabId, url, s, evaluation, now)
    return
  }
  await redirectToWaitIfNeeded(tabId, url, s, evaluation, now)
}

/**
 * 残り秒数に応じた badge 背景色を返す。
 */
/**
 * 指定タブの action badge/title を現在の判定結果に合わせて更新する。
 */
async function updateActionForTab(tab: ActionTargetTab, now = new Date()): Promise<void> {
  if (typeof tab.id !== 'number') return
  const s = await currentSettings()
  const next = buildActionState(currentPair(s), counters, tab.url, now)

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
  const evaluation = applyGroupPauseState(
    evaluateCurrentUrl(s, tab.url, now),
    groupPauseState,
    now.getTime(),
  )
  await enforceEvaluation(tab.id, tab.url, s, evaluation, now)
}

/**
 * すべての既存タブを再評価する。
 */
async function reevaluateAllTabs(): Promise<void> {
  const tabs = await browser.tabs.query({})
  await Promise.all(tabs.map((tab) => reevaluateTab(tab)))
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
    const pair = currentPair(s)
    const nextCounters = incrementEffectiveCounters(
      pair.baseline,
      pair.preferred,
      counters,
      activeTab.url,
      now,
      1,
    )
    if (!jsonEqual(nextCounters, counters)) {
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
async function handleNavigation(
  details:
    | WebNavigation.OnBeforeNavigateDetailsType
    | WebNavigation.OnHistoryStateUpdatedDetailsType,
): Promise<void> {
  if (details.frameId !== 0) return
  const s = await currentSettings()
  const now = new Date()
  await mergeStoredCounters(s, now)
  const evaluation = applyGroupPauseState(
    evaluateCurrentUrl(s, details.url, now),
    groupPauseState,
    now.getTime(),
  )
  await updateActionForTab({ id: details.tabId, url: details.url }, now)
  await enforceEvaluation(details.tabId, details.url, s, evaluation, now)
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
      await withReloadLock(reloadSettings)
      await reevaluateAllTabs()
    })
  })

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    if (!changes.counters && !changes.groupPauseState && !changes.delayGrantState) return
    runAsync(async () => {
      if (changes.counters) await reloadCounters()
      if (changes.groupPauseState) await reloadGroupPauseState()
      if (changes.delayGrantState) await reloadDelayGrantState()
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
    runAsync(async () => reevaluateTab({ ...tab, id: tabId, url }))
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
      await withReloadLock(reloadSettings)
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
