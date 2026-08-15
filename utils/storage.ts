import { sortRulesByEvaluationOrder } from './groupStatus'
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PAUSE_DURATION_MINUTES,
  DEFAULT_PAUSE_WAIT_SECONDS,
  DEFAULT_WAIT_GRANT_MINUTES,
} from './defaults'
import {
  convertLegacyDailyRules,
  migrateLegacyRules,
  normalizeLegacyRestrictions,
} from './migrateLegacy'
import { normalizeDelayGrantState } from './delayGrant'
import { createEffectiveSettingsState } from './effectiveSettings'
import { normalizeTimeWindows } from './normalizeSchema'
import { asRecord, isRecord, normalizeEntryMap, normalizeInteger } from './record'
import type {
  BlockDestination,
  DelayGrantState,
  EffectiveSettingsState,
  Group,
  GroupMode,
  GroupPauseEntry,
  GroupPauseState,
  Rule,
  RuleRestriction,
  Settings,
  UsageCountersState,
  UsageNotificationEntry,
  UsageNotificationHistoryState,
} from './types'
import { buildRule } from './ruleFactory'
import { validateGlobalSettings, validateGroup } from './validation'

/**
 * 設定エクスポートファイルの現行スキーマバージョン。
 * リリース済みの旧バージョンは v2（1.0.0）・v3（1.1.0/1.2.0）・v4（1.3.0）・v11（1.4.0）のみ。
 * v5〜v10 は未リリース開発中にのみ存在した形式のためサポートしない。
 */
export const SETTINGS_EXPORT_VERSION = 12
const SUPPORTED_EXPORT_VERSIONS = [2, 3, 4, 11, SETTINGS_EXPORT_VERSION] as const
type SupportedExportVersion = (typeof SUPPORTED_EXPORT_VERSIONS)[number]

/**
 * エクスポートした設定ファイルの JSON 構造。
 */
export interface SettingsExportFile {
  /** 設定ファイル形式のバージョン。 */
  version: SupportedExportVersion
  /** storage.sync に保存する設定本体。 */
  settings: Settings
}

/**
 * storage.local の 1 キーを読み、正規化した値を返す。
 * 未保存キーは `undefined` として `normalize` に渡るため、既定値の決定は normalize 側に寄せる。
 */
async function readLocal<T>(key: string, normalize: (value: unknown) => T): Promise<T> {
  const raw = (await browser.storage.local.get([key])) as Record<string, unknown>
  return normalize(raw[key])
}

/**
 * storage.local の 1 キーへ書き込む。
 */
async function writeLocal(key: string, value: unknown): Promise<void> {
  await browser.storage.local.set({ [key]: value })
}

/**
 * 保存済み値を残り時間通知 ON/OFF 設定へ正規化する。
 */
function normalizeRemainingTimeNotificationsEnabled(
  value: unknown,
  rawThresholdMinutes: unknown,
): boolean {
  if (typeof value === 'boolean') return value
  return rawThresholdMinutes !== 0
}

/**
 * unknown の値からグループ設定を生成する。
 * `rules` が無い旧フォーマット（`timeWindows` / `restrictions` / `dailyRules`）は
 * `migrateLegacyRules` で `Rule[]` へ移行する。
 * 返す `rules` は常に評価順へ並べ替え済みにする。
 */
function normalizeGroup(value: unknown, globalRedirectUrl?: string): Group {
  const g = asRecord(value)
  const id = typeof g.id === 'string' ? g.id : crypto.randomUUID()
  const legacy = convertLegacyDailyRules(g.dailyRules)
  // グループが遷移先を明示していればそれが勝ち、未指定のときだけグローバル設定へフォールバックする。
  const fallbackRedirectUrl =
    g.blockAction === 'redirect' && typeof g.redirectUrl === 'string'
      ? g.redirectUrl
      : g.blockAction === 'blockedPage'
        ? undefined
        : globalRedirectUrl
  const storedRules = normalizeRules(g.rules, id)
  const rules =
    storedRules ??
    migrateLegacyRules({
      groupId: id,
      timeWindows: normalizeTimeWindows(g.timeWindows) ?? legacy.timeWindows,
      restrictions: normalizeLegacyRestrictions(g.restrictions) ?? legacy.restrictions,
      ...(fallbackRedirectUrl === undefined ? {} : { fallbackRedirectUrl }),
    })

  return {
    id,
    name: typeof g.name === 'string' ? g.name : '',
    mode: (g.mode === 'blacklist' || g.mode === 'whitelist' ? g.mode : 'blacklist') as GroupMode,
    disabled: g.disabled === true,
    lockMode: g.lockMode === true,
    patterns: Array.isArray(g.patterns) ? g.patterns.filter((p) => typeof p === 'string') : [],
    pauseWaitSeconds: normalizeInteger(g.pauseWaitSeconds, 0, DEFAULT_PAUSE_WAIT_SECONDS),
    pauseDurationMinutes: normalizeInteger(
      g.pauseDurationMinutes,
      1,
      DEFAULT_PAUSE_DURATION_MINUTES,
    ),
    pauseAllowed: g.pauseAllowed !== false,
    rules: sortRulesByEvaluationOrder(rules),
  }
}

/** unknown の値からブロック時の遷移先を生成する。 */
function normalizeBlockDestination(value: unknown): BlockDestination {
  const destination = asRecord(value)
  if (destination.type === 'redirect' && typeof destination.url === 'string') {
    return { type: 'redirect', url: destination.url }
  }
  return { type: 'blockedPage' }
}

/**
 * unknown の値からルールの制限内容を生成する。既知の kind 以外は undefined を返す。
 * 廃止した `sessionLimit` も未知の kind として扱い、保存済みルールごと黙って捨てる。
 */
function normalizeRuleRestriction(value: unknown): RuleRestriction | undefined {
  const restriction = asRecord(value)
  if (restriction.kind === 'block') return { kind: 'block' }
  if (restriction.kind === 'dailyLimit') {
    // 旧バージョンで保存できた 0 分は常時ブロックと等価。
    // Block へ寄せることで解除時刻の表示もウィンドウ基準の正しいものになる。
    if (restriction.minutes === 0) return { kind: 'block' }
    return {
      kind: 'dailyLimit',
      minutes: typeof restriction.minutes === 'number' ? restriction.minutes : -1,
    }
  }
  if (restriction.kind === 'wait') {
    return {
      kind: 'wait',
      seconds: typeof restriction.seconds === 'number' ? restriction.seconds : -1,
      grantMinutes:
        typeof restriction.grantMinutes === 'number' && restriction.grantMinutes >= 1
          ? restriction.grantMinutes
          : DEFAULT_WAIT_GRANT_MINUTES,
    }
  }
  return undefined
}

/**
 * unknown の値からルール配列を生成する。`rules` キー自体が無ければ undefined を返し、
 * 呼び出し側が旧フォーマットからの移行にフォールバックできるようにする。
 * id が欠けている場合は group id と位置から決定的に採番する。
 */
function normalizeRules(value: unknown, groupId: string): Rule[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item, index) => {
    const rule = asRecord(item)
    const restriction = normalizeRuleRestriction(rule.restriction)
    const window = normalizeTimeWindows([rule.window])?.[0]
    if (!restriction || !window) return []
    return [
      buildRule(
        typeof rule.id === 'string' && rule.id.length > 0 ? rule.id : `${groupId}:r${index}`,
        window,
        restriction,
        normalizeBlockDestination(rule.destination),
      ),
    ]
  })
}

/**
 * unknown の値から `Settings` を生成し、欠損フィールドを補完する。
 */
function normalizeSettings(raw: { global?: unknown; groups?: unknown }): Settings {
  const rawGlobal = asRecord(raw.global)
  const normalizedRawGlobal = { ...rawGlobal }
  delete normalizedRawGlobal.pageOpenNotificationsEnabled
  delete normalizedRawGlobal.blockNotificationsEnabled
  delete normalizedRawGlobal.blockAction
  delete normalizedRawGlobal.redirectUrl
  const globalRedirectUrl =
    rawGlobal.blockAction === 'redirect' && typeof rawGlobal.redirectUrl === 'string'
      ? rawGlobal.redirectUrl
      : undefined
  const notificationThresholdMinutes = normalizeInteger(
    rawGlobal.notificationThresholdMinutes,
    1,
    DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes,
  )
  return {
    global: {
      ...DEFAULT_GLOBAL_SETTINGS,
      ...normalizedRawGlobal,
      notificationThresholdMinutes,
      remainingTimeNotificationsEnabled: normalizeRemainingTimeNotificationsEnabled(
        rawGlobal.remainingTimeNotificationsEnabled,
        rawGlobal.notificationThresholdMinutes,
      ),
    },
    groups: Array.isArray(raw.groups)
      ? raw.groups.map((group) => normalizeGroup(group, globalRedirectUrl))
      : [],
  }
}

/**
 * browser.storage.sync から `Settings` 全体を読み込む。
 * 未設定キーや欠損フィールドは `DEFAULT_GLOBAL_SETTINGS` で穴埋めする。
 * 旧 `dailyRules` は `timeWindows` / `restrictions` へ自動変換し、それ以前の旧フォーマット
 * （`schedules` / `blockedTimeSlots` / `timeLimits`）は破棄して制限なしで初期化する。
 */
export async function loadSettings(): Promise<Settings> {
  const raw = (await browser.storage.sync.get(['global', 'groups'])) as {
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
export async function loadEffectiveSettingsState(
  fallbackSettings: Settings,
  now = new Date(),
): Promise<EffectiveSettingsState> {
  const raw = (await browser.storage.local.get([
    'effectiveSettings',
    'effectiveSettingsLogicalDate',
  ])) as {
    effectiveSettings?: unknown
    effectiveSettingsLogicalDate?: unknown
  }
  if (!isRecord(raw.effectiveSettings)) {
    return createEffectiveSettingsState(fallbackSettings, now)
  }

  return {
    effectiveSettings: normalizeSettings(raw.effectiveSettings),
    effectiveSettingsLogicalDate:
      typeof raw.effectiveSettingsLogicalDate === 'string'
        ? raw.effectiveSettingsLogicalDate
        : createEffectiveSettingsState(fallbackSettings, now).effectiveSettingsLogicalDate,
  }
}

/**
 * 画面の初期表示・再読み込みに必要なストレージ読み込み結果。
 */
export interface PageState {
  /** 保存済み設定。 */
  settings: Settings
  /** 利用カウンタ。 */
  counters: UsageCountersState
  /** 現在適用中の有効設定。 */
  effectiveSettings: Settings
}

/**
 * 画面表示に必要な保存済み設定・利用カウンタ・有効設定をまとめて読み込む。
 */
export async function loadPageState(now = new Date()): Promise<PageState> {
  const [settings, counters] = await Promise.all([loadSettings(), loadCounters()])
  const { effectiveSettings } = await loadEffectiveSettingsState(settings, now)
  return { settings, counters, effectiveSettings }
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
  return `${JSON.stringify(
    {
      version: SETTINGS_EXPORT_VERSION,
      settings,
    } satisfies SettingsExportFile,
    null,
    2,
  )}\n`
}

/**
 * エクスポート JSON から設定を読み込み、保存可能な設定として検証する。
 */
export function parseSettingsExportJson(json: string): Settings {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON')
  }

  const file: Record<string, unknown> = asRecord(parsed)
  if (!SUPPORTED_EXPORT_VERSIONS.some((version) => file.version === version)) {
    throw new Error('Unsupported settings file version')
  }
  if (!isRecord(file.settings)) {
    throw new Error('Settings file is missing settings')
  }

  const rawSettings = file.settings
  if (!isRecord(rawSettings.global)) {
    throw new Error('Settings file is missing global settings')
  }
  if (!Array.isArray(rawSettings.groups)) {
    throw new Error('Settings file is missing groups')
  }

  const settings = normalizeSettings(rawSettings)
  const errors = [
    ...validateGlobalSettings(settings.global),
    ...settings.groups.flatMap((group) => validateGroup(group)),
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
  return {
    counters: await readLocal('counters', (raw) =>
      normalizeEntryMap(raw, undefined, (value) => {
        const counter = asRecord(value)
        if (typeof counter.logicalDate !== 'string') return undefined
        if (!Number.isFinite(counter.consumedSec)) return undefined
        return {
          logicalDate: counter.logicalDate,
          consumedSec: Math.max(0, Math.floor(counter.consumedSec as number)),
        }
      }),
    ),
  }
}

/**
 * browser.storage.local に閲覧秒数カウンタを書き込む。
 */
export async function saveCounters(state: UsageCountersState): Promise<void> {
  await writeLocal('counters', state.counters)
}

/**
 * unknown の値から一時停止エントリを生成する。有効期限切れまたは空の値は undefined を返す。
 */
function normalizeGroupPauseEntry(value: unknown, now: number): GroupPauseEntry | undefined {
  if (!isRecord(value)) return undefined

  const normalized: GroupPauseEntry = {}
  if (
    typeof value.waitingUntil === 'number' &&
    Number.isFinite(value.waitingUntil) &&
    value.waitingUntil > 0
  ) {
    normalized.waitingUntil = Math.floor(value.waitingUntil)
  }
  if (
    typeof value.pausedUntil === 'number' &&
    Number.isFinite(value.pausedUntil) &&
    value.pausedUntil > now
  ) {
    normalized.pausedUntil = Math.floor(value.pausedUntil)
  }

  return normalized.waitingUntil || normalized.pausedUntil ? normalized : undefined
}

/**
 * unknown の値から一時停止状態辞書を生成する。
 */
function normalizeGroupPauseState(
  value: unknown,
  validGroupIds?: Iterable<string>,
  now = Date.now(),
): GroupPauseState {
  return {
    groupPauseState: normalizeEntryMap(value, validGroupIds, (entryValue) =>
      normalizeGroupPauseEntry(entryValue, now),
    ),
  }
}

/**
 * browser.storage.local からグループ一時停止状態を読み込む。
 * 不正値、期限切れ値、指定された group id に存在しない値は除外する。
 */
export async function loadGroupPauseState(
  validGroupIds?: Iterable<string>,
  now = Date.now(),
): Promise<GroupPauseState> {
  return readLocal('groupPauseState', (raw) => normalizeGroupPauseState(raw, validGroupIds, now))
}

/**
 * browser.storage.local にグループ一時停止状態を書き込む。
 */
export async function saveGroupPauseState(state: GroupPauseState): Promise<void> {
  await writeLocal('groupPauseState', state.groupPauseState)
}

/**
 * browser.storage.local から待機ゲートのアクセス許可状態を読み込む。
 * 不正値、期限切れ値、指定された group id に存在しない値は除外する。
 */
export async function loadDelayGrantState(
  validGroupIds?: Iterable<string>,
  now = Date.now(),
): Promise<DelayGrantState> {
  return readLocal('delayGrantState', (raw) => normalizeDelayGrantState(raw, validGroupIds, now))
}

/**
 * browser.storage.local に待機ゲートのアクセス許可状態を書き込む。
 */
export async function saveDelayGrantState(state: DelayGrantState): Promise<void> {
  await writeLocal('delayGrantState', state.delayGrantState)
}

/**
 * 廃止した機能が storage.local に残した永続ステートを削除する。
 * `sessionLimitState` は Session limit 種別の削除に伴い読み書きされなくなったキー。
 */
export async function removeObsoleteLocalState(): Promise<void> {
  await browser.storage.local.remove('sessionLimitState')
}

/**
 * browser.storage.local から残り時間通知履歴を読み込む。
 * 不正な保存値は空の履歴にフォールバックする。
 */
export async function loadUsageNotificationHistory(): Promise<UsageNotificationHistoryState> {
  return {
    usageNotificationHistory: await readLocal(
      'usageNotificationHistory',
      normalizeNotificationHistory,
    ),
  }
}

/**
 * unknown の値から通知履歴辞書を生成する。
 */
function normalizeNotificationHistory(value: unknown): Record<string, UsageNotificationEntry> {
  return normalizeEntryMap(value, undefined, (entryValue) => {
    const entry = asRecord(entryValue)
    return typeof entry.logicalDate === 'string' ? { logicalDate: entry.logicalDate } : undefined
  })
}

/**
 * browser.storage.local に残り時間通知履歴を書き込む。
 */
export async function saveUsageNotificationHistory(
  state: UsageNotificationHistoryState,
): Promise<void> {
  await writeLocal('usageNotificationHistory', state.usageNotificationHistory)
}
