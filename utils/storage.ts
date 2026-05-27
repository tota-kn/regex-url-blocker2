import { createEmptyDailyRules, DEFAULT_GLOBAL_SETTINGS } from './defaults'
import { createEffectiveSettingsState } from './effectiveSettings'
import type { BlockAction, BlockNotificationHistoryState, DailyRule, DayOfWeek, EffectiveSettingsState, Group, GroupMode, PageOpenNotificationHistoryState, Settings, TimeRange, UsageCountersState, UsageNotificationEntry, UsageNotificationHistoryState } from './types'
import { validateGlobalSettings, validateGroup } from './validation'

/**
 * 設定エクスポートファイルの現行スキーマバージョン。
 */
export const SETTINGS_EXPORT_VERSION = 2

/**
 * エクスポートした設定ファイルの JSON 構造。
 */
export interface SettingsExportFile {
  /** 設定ファイル形式のバージョン。 */
  version: typeof SETTINGS_EXPORT_VERSION
  /** storage.sync に保存する設定本体。 */
  settings: Settings
}

/**
 * 保存済み値を有効なブロック時動作へ正規化する。
 */
function normalizeBlockAction(value: unknown): BlockAction {
  return value === 'redirect' || value === 'blockedPage' ? value : DEFAULT_GLOBAL_SETTINGS.blockAction
}

/**
 * 保存済み値を残り時間通知の閾値分数へ正規化する。
 */
function normalizeNotificationThresholdMinutes(value: unknown): number {
  return typeof value === 'number' ? value : DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes
}

/**
 * 保存済み値を boolean 設定へ正規化する。
 */
function normalizeBooleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * object 風の値を安全にレコードとして扱う。
 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/**
 * unknown の値からグループ設定を生成する。
 */
function normalizeGroup(value: unknown): Group {
  const g = asRecord(value)
  return {
    id: typeof g.id === 'string' ? g.id : crypto.randomUUID(),
    name: typeof g.name === 'string' ? g.name : '',
    mode: (g.mode === 'blacklist' || g.mode === 'whitelist' ? g.mode : 'blacklist') as GroupMode,
    lockMode: g.lockMode === true,
    patterns: Array.isArray(g.patterns) ? g.patterns.filter(p => typeof p === 'string') : [],
    dailyRules: normalizeDailyRules(g.dailyRules),
  }
}

/**
 * unknown の値から分単位の時間帯を生成する。
 */
function normalizeTimeRange(value: unknown): TimeRange {
  const range = asRecord(value)
  return {
    startMinute: typeof range.startMinute === 'number' ? range.startMinute : -1,
    endMinute: typeof range.endMinute === 'number' ? range.endMinute : -1,
  }
}

/**
 * unknown の値から曜日別ルールを生成する。
 */
function normalizeDailyRule(value: unknown): DailyRule {
  const rule = asRecord(value)
  return {
    dayOfWeek: (Number.isInteger(rule.dayOfWeek) ? rule.dayOfWeek : -1) as DayOfWeek,
    blockedTimeRanges: Array.isArray(rule.blockedTimeRanges) ? rule.blockedTimeRanges.map(normalizeTimeRange) : [],
    dailyLimitMinutes: typeof rule.dailyLimitMinutes === 'number' ? rule.dailyLimitMinutes : undefined,
  }
}

/**
 * unknown の値から7曜日分のルール配列を生成する。
 */
function normalizeDailyRules(value: unknown): DailyRule[] {
  if (!Array.isArray(value)) return createEmptyDailyRules()
  return value.map(normalizeDailyRule)
}

/**
 * unknown の値から `Settings` を生成し、欠損フィールドを補完する。
 */
function normalizeSettings(raw: { global?: unknown, groups?: unknown }): Settings {
  const rawGlobal = asRecord(raw.global)
  return {
    global: {
      ...DEFAULT_GLOBAL_SETTINGS,
      ...rawGlobal,
      blockAction: normalizeBlockAction(rawGlobal.blockAction),
      notificationThresholdMinutes: normalizeNotificationThresholdMinutes(rawGlobal.notificationThresholdMinutes),
      pageOpenNotificationsEnabled: normalizeBooleanSetting(rawGlobal.pageOpenNotificationsEnabled, DEFAULT_GLOBAL_SETTINGS.pageOpenNotificationsEnabled),
      blockNotificationsEnabled: normalizeBooleanSetting(rawGlobal.blockNotificationsEnabled, DEFAULT_GLOBAL_SETTINGS.blockNotificationsEnabled),
    },
    groups: Array.isArray(raw.groups) ? raw.groups.map(normalizeGroup) : [],
  }
}

/**
 * browser.storage.sync から `Settings` 全体を読み込む。
 * 未設定キーや欠損フィールドは `DEFAULT_GLOBAL_SETTINGS` で穴埋めする。
 * 旧フォーマット（`schedules` / `blockedTimeSlots` / `timeLimits`）は破棄し空の `dailyRules` で初期化する。
 */
export async function loadSettings(): Promise<Settings> {
  const raw = await browser.storage.sync.get(['global', 'groups']) as {
    global?: unknown
    groups?: unknown
  }
  return normalizeSettings(raw)
}

/**
 * browser.storage.sync に `Settings` 全体を書き込む。
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.sync.set({
    global: settings.global,
    groups: settings.groups,
  })
}

/**
 * browser.storage.local から有効設定スナップショットを読み込む。
 * 未保存または不正な場合は指定された希望設定を初期有効設定として返す。
 */
export async function loadEffectiveSettingsState(fallbackSettings: Settings, now = new Date()): Promise<EffectiveSettingsState> {
  const raw = await browser.storage.local.get(['effectiveSettings', 'effectiveSettingsLogicalDate']) as {
    effectiveSettings?: unknown
    effectiveSettingsLogicalDate?: unknown
  }
  if (!raw.effectiveSettings || typeof raw.effectiveSettings !== 'object' || Array.isArray(raw.effectiveSettings)) {
    return createEffectiveSettingsState(fallbackSettings, now)
  }

  const settingsRecord = raw.effectiveSettings as Record<string, unknown>
  return {
    effectiveSettings: normalizeSettings(settingsRecord),
    effectiveSettingsLogicalDate: typeof raw.effectiveSettingsLogicalDate === 'string'
      ? raw.effectiveSettingsLogicalDate
      : createEffectiveSettingsState(fallbackSettings, now).effectiveSettingsLogicalDate,
  }
}

/**
 * browser.storage.local に有効設定スナップショットを書き込む。
 */
export async function saveEffectiveSettingsState(state: EffectiveSettingsState): Promise<void> {
  await browser.storage.local.set({
    effectiveSettings: state.effectiveSettings,
    effectiveSettingsLogicalDate: state.effectiveSettingsLogicalDate,
  })
}

/**
 * 現在の設定をエクスポート用 JSON 文字列へ変換する。
 */
export function serializeSettingsExport(settings: Settings): string {
  return `${JSON.stringify({
    version: SETTINGS_EXPORT_VERSION,
    settings,
  } satisfies SettingsExportFile, null, 2)}\n`
}

/**
 * エクスポート JSON から設定を読み込み、保存可能な設定として検証する。
 */
export function parseSettingsExportJson(json: string): Settings {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  }
  catch {
    throw new Error('Invalid JSON')
  }

  const file = asRecord(parsed)
  if (file.version !== SETTINGS_EXPORT_VERSION) {
    throw new Error('Unsupported settings file version')
  }
  if (!file.settings || typeof file.settings !== 'object' || Array.isArray(file.settings)) {
    throw new Error('Settings file is missing settings')
  }

  const rawSettings = file.settings as Record<string, unknown>
  if (!rawSettings.global || typeof rawSettings.global !== 'object' || Array.isArray(rawSettings.global)) {
    throw new Error('Settings file is missing global settings')
  }
  if (!Array.isArray(rawSettings.groups)) {
    throw new Error('Settings file is missing groups')
  }

  const settings = normalizeSettings(rawSettings)
  const errors = [
    ...validateGlobalSettings(settings.global),
    ...settings.groups.flatMap(validateGroup),
  ]
  if (errors.length > 0) {
    throw new Error('Settings file contains invalid settings')
  }

  return settings
}

/**
 * browser.storage.local から閲覧秒数カウンタを読み込む。
 * 不正な保存値は空のカウンタにフォールバックする。
 */
export async function loadCounters(): Promise<UsageCountersState> {
  const raw = await browser.storage.local.get(['counters']) as {
    counters?: unknown
  }
  if (!raw.counters || typeof raw.counters !== 'object' || Array.isArray(raw.counters)) {
    return { counters: {} }
  }

  const counters: UsageCountersState['counters'] = {}
  for (const [groupId, value] of Object.entries(raw.counters as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const counter = value as Record<string, unknown>
    if (typeof counter.logicalDate !== 'string') continue
    if (!Number.isFinite(counter.consumedSec)) continue
    counters[groupId] = {
      logicalDate: counter.logicalDate,
      consumedSec: Math.max(0, Math.floor(counter.consumedSec as number)),
    }
  }
  return { counters }
}

/**
 * browser.storage.local に閲覧秒数カウンタを書き込む。
 */
export async function saveCounters(state: UsageCountersState): Promise<void> {
  await browser.storage.local.set({
    counters: state.counters,
  })
}

/**
 * browser.storage.local から残り時間通知履歴を読み込む。
 * 不正な保存値は空の履歴にフォールバックする。
 */
export async function loadUsageNotificationHistory(): Promise<UsageNotificationHistoryState> {
  const raw = await browser.storage.local.get(['usageNotificationHistory']) as {
    usageNotificationHistory?: unknown
  }
  return { usageNotificationHistory: normalizeNotificationHistory(raw.usageNotificationHistory) }
}

/**
 * unknown の値から通知履歴辞書を生成する。
 */
function normalizeNotificationHistory(value: unknown): Record<string, UsageNotificationEntry> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const history: Record<string, UsageNotificationEntry> = {}
  for (const [groupId, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (!entryValue || typeof entryValue !== 'object' || Array.isArray(entryValue)) continue
    const entry = entryValue as Record<string, unknown>
    if (typeof entry.logicalDate !== 'string') continue
    history[groupId] = { logicalDate: entry.logicalDate }
  }
  return history
}

/**
 * browser.storage.local から対象ページ表示通知履歴を読み込む。
 * 不正な保存値は空の履歴にフォールバックする。
 */
export async function loadPageOpenNotificationHistory(): Promise<PageOpenNotificationHistoryState> {
  const raw = await browser.storage.local.get(['pageOpenNotificationHistory']) as {
    pageOpenNotificationHistory?: unknown
  }
  return { pageOpenNotificationHistory: normalizeNotificationHistory(raw.pageOpenNotificationHistory) }
}

/**
 * browser.storage.local に対象ページ表示通知履歴を書き込む。
 */
export async function savePageOpenNotificationHistory(state: PageOpenNotificationHistoryState): Promise<void> {
  await browser.storage.local.set({
    pageOpenNotificationHistory: state.pageOpenNotificationHistory,
  })
}

/**
 * browser.storage.local から redirect ブロック通知履歴を読み込む。
 * 不正な保存値は空の履歴にフォールバックする。
 */
export async function loadBlockNotificationHistory(): Promise<BlockNotificationHistoryState> {
  const raw = await browser.storage.local.get(['blockNotificationHistory']) as {
    blockNotificationHistory?: unknown
  }
  return { blockNotificationHistory: normalizeNotificationHistory(raw.blockNotificationHistory) }
}

/**
 * browser.storage.local に redirect ブロック通知履歴を書き込む。
 */
export async function saveBlockNotificationHistory(state: BlockNotificationHistoryState): Promise<void> {
  await browser.storage.local.set({
    blockNotificationHistory: state.blockNotificationHistory,
  })
}

/**
 * browser.storage.local に残り時間通知履歴を書き込む。
 */
export async function saveUsageNotificationHistory(state: UsageNotificationHistoryState): Promise<void> {
  await browser.storage.local.set({
    usageNotificationHistory: state.usageNotificationHistory,
  })
}
