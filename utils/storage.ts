import { sortRulesByEvaluationOrder } from './blocking'
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PAUSE_DURATION_MINUTES,
  DEFAULT_PAUSE_WAIT_SECONDS,
  DEFAULT_SESSION_BREAK_MINUTES,
  DEFAULT_SESSION_LIMIT_MINUTES,
  DEFAULT_WAIT_GRANT_MINUTES,
} from './defaults'
import { migrateLegacyRules, type LegacyRestriction } from './migrateLegacy'
import { normalizeDelayGrantState } from './delayGrant'
import { createEffectiveSettingsState } from './effectiveSettings'
import type {
  BlockDestination,
  DayOfWeek,
  DelayGrantState,
  EffectiveSettingsState,
  Group,
  GroupMode,
  GroupPauseEntry,
  GroupPauseState,
  MonthDay,
  Rule,
  RuleRestriction,
  SessionLimitEntry,
  SessionLimitState,
  ScheduleRuleCondition,
  Settings,
  TimeRange,
  TimeWindow,
  UsageCountersState,
  UsageNotificationEntry,
  UsageNotificationHistoryState,
} from './types'
import { validateGlobalSettings, validateGroup } from './validation'

/**
 * 設定エクスポートファイルの現行スキーマバージョン。
 * リリース済みの旧バージョンは v2（1.0.0）・v3（1.1.0/1.2.0）・v4（1.3.0）・v11（1.4.0）のみ。
 * v5〜v10 は未リリース開発中にのみ存在した形式のためサポートしない。
 */
export const SETTINGS_EXPORT_VERSION = 12

/**
 * エクスポートした設定ファイルの JSON 構造。
 */
export interface SettingsExportFile {
  /** 設定ファイル形式のバージョン。 */
  version: 2 | 3 | 4 | 11 | typeof SETTINGS_EXPORT_VERSION
  /** storage.sync に保存する設定本体。 */
  settings: Settings
}

/**
 * 保存済み値を残り時間通知の閾値分数へ正規化する。
 */
function normalizeNotificationThresholdMinutes(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes
}

/** 保存済み値を一時停止前待機秒数へ正規化する。 */
function normalizePauseWaitSeconds(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_PAUSE_WAIT_SECONDS
}

/** 保存済み値を一時停止継続分数へ正規化する。 */
function normalizePauseDurationMinutes(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : DEFAULT_PAUSE_DURATION_MINUTES
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
 * object 風の値を安全にレコードとして扱う。
 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
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
    pauseWaitSeconds: normalizePauseWaitSeconds(g.pauseWaitSeconds),
    pauseDurationMinutes: normalizePauseDurationMinutes(g.pauseDurationMinutes),
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

/** unknown の値からルールの制限内容を生成する。既知の kind 以外は undefined を返す。 */
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
  if (restriction.kind === 'sessionLimit') {
    return {
      kind: 'sessionLimit',
      sessionMinutes:
        typeof restriction.sessionMinutes === 'number'
          ? restriction.sessionMinutes
          : DEFAULT_SESSION_LIMIT_MINUTES,
      breakMinutes:
        typeof restriction.breakMinutes === 'number'
          ? restriction.breakMinutes
          : DEFAULT_SESSION_BREAK_MINUTES,
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
      {
        id: typeof rule.id === 'string' && rule.id.length > 0 ? rule.id : `${groupId}:r${index}`,
        window,
        restriction,
        ...(restriction.kind === 'wait'
          ? {}
          : { destination: normalizeBlockDestination(rule.destination) }),
      } satisfies Rule,
    ]
  })
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
 * unknown の値から月日を生成する。数値以外は -1（validation で拒否される値）にする。
 */
function normalizeMonthDay(value: unknown): MonthDay {
  const monthDay = asRecord(value)
  return {
    month: typeof monthDay.month === 'number' ? monthDay.month : -1,
    day: typeof monthDay.day === 'number' ? monthDay.day : -1,
  }
}

/**
 * unknown の値からスケジュールルールの条件を生成する。既知の type 以外は undefined を返す。
 */
function normalizeScheduleRuleCondition(value: unknown): ScheduleRuleCondition | undefined {
  const condition = asRecord(value)
  if (condition.type === 'daily') {
    return { type: 'daily' }
  }
  if (condition.type === 'weekly') {
    return {
      type: 'weekly',
      daysOfWeek: Array.isArray(condition.daysOfWeek)
        ? condition.daysOfWeek.filter((day): day is DayOfWeek => Number.isInteger(day))
        : [],
    }
  }
  if (condition.type === 'monthly') {
    return {
      type: 'monthly',
      daysOfMonth: Array.isArray(condition.daysOfMonth)
        ? condition.daysOfMonth.filter((day): day is number => Number.isInteger(day))
        : [],
    }
  }
  if (condition.type === 'period') {
    return {
      type: 'period',
      start: normalizeMonthDay(condition.start),
      end: normalizeMonthDay(condition.end),
    }
  }
  return undefined
}

/** unknown の値から旧フォーマットの制限を生成する。移行にのみ使う。 */
function normalizeLegacyRestriction(value: unknown): LegacyRestriction | undefined {
  const valueRecord = asRecord(value)
  if (
    valueRecord.type !== 'block' &&
    valueRecord.type !== 'redirect' &&
    valueRecord.type !== 'grace' &&
    valueRecord.type !== 'wait' &&
    valueRecord.type !== 'sessionLimit'
  )
    return undefined
  const restriction: LegacyRestriction = { type: valueRecord.type }
  if (typeof valueRecord.graceMinutes === 'number')
    restriction.graceMinutes = valueRecord.graceMinutes
  if (typeof valueRecord.waitSeconds === 'number') restriction.waitSeconds = valueRecord.waitSeconds
  if (valueRecord.type === 'wait') {
    restriction.waitGrantMinutes =
      typeof valueRecord.waitGrantMinutes === 'number' && valueRecord.waitGrantMinutes >= 1
        ? valueRecord.waitGrantMinutes
        : DEFAULT_WAIT_GRANT_MINUTES
  }
  if (typeof valueRecord.redirectUrl === 'string') restriction.redirectUrl = valueRecord.redirectUrl
  if (typeof valueRecord.sessionMinutes === 'number')
    restriction.sessionMinutes = valueRecord.sessionMinutes
  if (typeof valueRecord.breakMinutes === 'number')
    restriction.breakMinutes = valueRecord.breakMinutes
  return restriction
}

/**
 * unknown の値から旧フォーマットの制限配列を生成する。
 * 同種は厳格側（grace は最小・wait は最大・sessionLimit は最短枠/最長休憩）へ畳む。
 */
function normalizeLegacyRestrictions(value: unknown): LegacyRestriction[] | undefined {
  if (!Array.isArray(value)) return undefined
  const restrictions = value.flatMap((item) => {
    const restriction = normalizeLegacyRestriction(item)
    return restriction ? [restriction] : []
  })
  const block = restrictions.find((restriction) => restriction.type === 'block')
  const redirect = restrictions.find((restriction) => restriction.type === 'redirect')
  const graceMinutes = restrictions
    .filter((restriction) => restriction.type === 'grace')
    .map((restriction) => restriction.graceMinutes)
    .filter((minutes): minutes is number => minutes !== undefined)
  const waitSeconds = restrictions
    .filter((restriction) => restriction.type === 'wait')
    .map((restriction) => restriction.waitSeconds)
    .filter((seconds): seconds is number => seconds !== undefined)
  const waitGrantMinutes = restrictions
    .filter((restriction) => restriction.type === 'wait')
    .map((restriction) => restriction.waitGrantMinutes ?? DEFAULT_WAIT_GRANT_MINUTES)
    .filter(
      (minutes): minutes is number =>
        minutes !== undefined && Number.isInteger(minutes) && minutes >= 1,
    )
  const sessionMinutes = restrictions
    .filter((restriction) => restriction.type === 'sessionLimit')
    .map((restriction) => restriction.sessionMinutes)
    .filter(
      (minutes): minutes is number =>
        minutes !== undefined && Number.isInteger(minutes) && minutes >= 1,
    )
  const breakMinutes = restrictions
    .filter((restriction) => restriction.type === 'sessionLimit')
    .map((restriction) => restriction.breakMinutes)
    .filter(
      (minutes): minutes is number =>
        minutes !== undefined && Number.isInteger(minutes) && minutes >= 1,
    )
  const normalized: LegacyRestriction[] = []
  if (block) normalized.push({ type: 'block' })
  else if (redirect) normalized.push(redirect)
  if (graceMinutes.length > 0)
    normalized.push({ type: 'grace', graceMinutes: Math.min(...graceMinutes) })
  if (waitSeconds.length > 0)
    normalized.push({
      type: 'wait',
      waitSeconds: Math.max(...waitSeconds),
      waitGrantMinutes:
        waitGrantMinutes.length > 0 ? Math.max(...waitGrantMinutes) : DEFAULT_WAIT_GRANT_MINUTES,
    })
  if (sessionMinutes.length > 0 && breakMinutes.length > 0)
    normalized.push({
      type: 'sessionLimit',
      sessionMinutes: Math.min(...sessionMinutes),
      breakMinutes: Math.max(...breakMinutes),
    })
  return normalized
}

/** unknown の値から分離形式の時間ウィンドウを生成する。 */
function normalizeTimeWindows(value: unknown): TimeWindow[] | undefined {
  if (!Array.isArray(value)) return undefined
  const windows: TimeWindow[] = []
  value.forEach((item) => {
    const window = asRecord(item)
    if (window.type === 'always') {
      windows.push({ type: 'always' })
      return
    }
    if (window.type !== 'scheduled') return
    const condition = normalizeScheduleRuleCondition(window.condition)
    if (condition)
      windows.push({
        type: 'scheduled',
        condition,
        timeRanges: Array.isArray(window.timeRanges)
          ? window.timeRanges.map(normalizeTimeRange)
          : [],
      })
  })
  return windows
}

/** スケジュール条件と時間帯の組を時間ウィンドウへ変換する。毎日かつ時間帯なしは常時ウィンドウにする。 */
function toTimeWindow(condition: ScheduleRuleCondition, timeRanges: TimeRange[]): TimeWindow {
  return condition.type === 'daily' && timeRanges.length === 0
    ? { type: 'always' }
    : { type: 'scheduled', condition, timeRanges }
}

/**
 * 旧フォーマット（v2〜v4）の曜日別ルール（`dailyRules`）を `timeWindows` / `restrictions` へ変換する。
 * 同一内容（ブロック時間帯・上限）の曜日をまとめて weekly 条件1件にし、全曜日同一なら daily 条件にする。
 * ブロック時間帯は block 制限、閲覧上限は grace 制限として block → grace の順に展開する。
 */
function convertLegacyDailyRules(value: unknown): {
  timeWindows: TimeWindow[]
  restrictions: LegacyRestriction[]
} {
  const timeWindows: TimeWindow[] = []
  const restrictions: LegacyRestriction[] = []
  if (!Array.isArray(value)) return { timeWindows, restrictions }

  const byContent = new Map<
    string,
    { daysOfWeek: Set<DayOfWeek>; blockedTimeRanges: TimeRange[]; dailyLimitMinutes?: number }
  >()
  for (const item of value) {
    const rule = asRecord(item)
    const dayOfWeek = rule.dayOfWeek
    if (!Number.isInteger(dayOfWeek) || (dayOfWeek as number) < 0 || (dayOfWeek as number) > 6)
      continue

    const blockedTimeRanges = Array.isArray(rule.blockedTimeRanges)
      ? rule.blockedTimeRanges.map(normalizeTimeRange)
      : []
    const dailyLimitMinutes =
      typeof rule.dailyLimitMinutes === 'number' ? rule.dailyLimitMinutes : undefined
    if (blockedTimeRanges.length === 0 && dailyLimitMinutes === undefined) continue

    const key = JSON.stringify([blockedTimeRanges, dailyLimitMinutes ?? null])
    const entry = byContent.get(key) ?? {
      daysOfWeek: new Set<DayOfWeek>(),
      blockedTimeRanges,
      dailyLimitMinutes,
    }
    entry.daysOfWeek.add(dayOfWeek as DayOfWeek)
    byContent.set(key, entry)
  }

  const entries = [...byContent.values()].map((entry) => ({
    condition:
      entry.daysOfWeek.size === 7
        ? { type: 'daily' as const }
        : { type: 'weekly' as const, daysOfWeek: [...entry.daysOfWeek].toSorted((a, b) => a - b) },
    blockedTimeRanges: entry.blockedTimeRanges,
    dailyLimitMinutes: entry.dailyLimitMinutes,
  }))
  for (const entry of entries) {
    if (entry.blockedTimeRanges.length === 0) continue
    timeWindows.push(toTimeWindow(entry.condition, entry.blockedTimeRanges))
    restrictions.push({ type: 'block' })
  }
  for (const entry of entries) {
    if (entry.dailyLimitMinutes === undefined) continue
    timeWindows.push(toTimeWindow(entry.condition, []))
    restrictions.push({ type: 'grace', graceMinutes: entry.dailyLimitMinutes })
  }
  return { timeWindows, restrictions }
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
  const notificationThresholdMinutes = normalizeNotificationThresholdMinutes(
    rawGlobal.notificationThresholdMinutes,
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
  if (
    !raw.effectiveSettings ||
    typeof raw.effectiveSettings !== 'object' ||
    Array.isArray(raw.effectiveSettings)
  ) {
    return createEffectiveSettingsState(fallbackSettings, now)
  }

  const settingsRecord = raw.effectiveSettings as Record<string, unknown>
  return {
    effectiveSettings: normalizeSettings(settingsRecord),
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
  /** 利用枠・休憩状態。 */
  sessionLimitState: SessionLimitState
}

/**
 * 画面表示に必要な保存済み設定・利用カウンタ・有効設定をまとめて読み込む。
 */
export async function loadPageState(now = new Date()): Promise<PageState> {
  const [settings, counters] = await Promise.all([loadSettings(), loadCounters()])
  const { effectiveSettings } = await loadEffectiveSettingsState(settings, now)
  const sessionLimitState = await loadSessionLimitState(
    effectiveSettings.groups.map((group) => group.id),
  )
  return { settings, counters, effectiveSettings, sessionLimitState }
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

  const file = asRecord(parsed)
  if (
    file.version !== 2 &&
    file.version !== 3 &&
    file.version !== 4 &&
    file.version !== 11 &&
    file.version !== SETTINGS_EXPORT_VERSION
  ) {
    throw new Error('Unsupported settings file version')
  }
  if (!file.settings || typeof file.settings !== 'object' || Array.isArray(file.settings)) {
    throw new Error('Settings file is missing settings')
  }

  const rawSettings = file.settings as Record<string, unknown>
  if (
    !rawSettings.global ||
    typeof rawSettings.global !== 'object' ||
    Array.isArray(rawSettings.global)
  ) {
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
  const raw = (await browser.storage.local.get(['counters'])) as {
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
 * unknown の値から一時停止エントリを生成する。有効期限切れまたは空の値は undefined を返す。
 */
function normalizeGroupPauseEntry(value: unknown, now: number): GroupPauseEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const entry = value as Record<string, unknown>
  const normalized: GroupPauseEntry = {}
  if (
    typeof entry.waitingUntil === 'number' &&
    Number.isFinite(entry.waitingUntil) &&
    entry.waitingUntil > 0
  ) {
    normalized.waitingUntil = Math.floor(entry.waitingUntil)
  }
  if (
    typeof entry.pausedUntil === 'number' &&
    Number.isFinite(entry.pausedUntil) &&
    entry.pausedUntil > now
  ) {
    normalized.pausedUntil = Math.floor(entry.pausedUntil)
  }

  return normalized.waitingUntil || normalized.pausedUntil ? normalized : undefined
}

/**
 * unknown の値から一時停止状態辞書を生成する。
 */
export function normalizeGroupPauseState(
  value: unknown,
  validGroupIds?: Iterable<string>,
  now = Date.now(),
): GroupPauseState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { groupPauseState: {} }

  const validIds = validGroupIds ? new Set(validGroupIds) : undefined
  const groupPauseState: GroupPauseState['groupPauseState'] = {}
  for (const [groupId, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (validIds && !validIds.has(groupId)) continue
    const entry = normalizeGroupPauseEntry(entryValue, now)
    if (entry) groupPauseState[groupId] = entry
  }
  return { groupPauseState }
}

/**
 * browser.storage.local からグループ一時停止状態を読み込む。
 * 不正値、期限切れ値、指定された group id に存在しない値は除外する。
 */
export async function loadGroupPauseState(
  validGroupIds?: Iterable<string>,
  now = Date.now(),
): Promise<GroupPauseState> {
  const raw = (await browser.storage.local.get(['groupPauseState'])) as {
    groupPauseState?: unknown
  }
  return normalizeGroupPauseState(raw.groupPauseState, validGroupIds, now)
}

/**
 * browser.storage.local にグループ一時停止状態を書き込む。
 */
export async function saveGroupPauseState(state: GroupPauseState): Promise<void> {
  await browser.storage.local.set({
    groupPauseState: state.groupPauseState,
  })
}

/**
 * browser.storage.local から待機ゲートのアクセス許可状態を読み込む。
 * 不正値、期限切れ値、指定された group id に存在しない値は除外する。
 */
export async function loadDelayGrantState(
  validGroupIds?: Iterable<string>,
  now = Date.now(),
): Promise<DelayGrantState> {
  const raw = (await browser.storage.local.get(['delayGrantState'])) as {
    delayGrantState?: unknown
  }
  return normalizeDelayGrantState(raw.delayGrantState, validGroupIds, now)
}

/**
 * browser.storage.local に待機ゲートのアクセス許可状態を書き込む。
 */
export async function saveDelayGrantState(state: DelayGrantState): Promise<void> {
  await browser.storage.local.set({
    delayGrantState: state.delayGrantState,
  })
}

/** unknown の値から利用枠開始状態を正規化する。 */
export function normalizeSessionLimitState(
  value: unknown,
  validGroupIds?: Iterable<string>,
): SessionLimitState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { sessionLimitState: {} }
  const validIds = validGroupIds ? new Set(validGroupIds) : undefined
  const sessionLimitState: Record<string, SessionLimitEntry> = {}
  for (const [groupId, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (validIds && !validIds.has(groupId)) continue
    if (!entryValue || typeof entryValue !== 'object' || Array.isArray(entryValue)) continue
    const startedAt = (entryValue as Record<string, unknown>).startedAt
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt <= 0) continue
    sessionLimitState[groupId] = { startedAt: Math.floor(startedAt) }
  }
  return { sessionLimitState }
}

/** browser.storage.local から利用枠・休憩状態を読み込む。 */
export async function loadSessionLimitState(
  validGroupIds?: Iterable<string>,
): Promise<SessionLimitState> {
  const raw = (await browser.storage.local.get(['sessionLimitState'])) as {
    sessionLimitState?: unknown
  }
  return normalizeSessionLimitState(raw.sessionLimitState, validGroupIds)
}

/** browser.storage.local に利用枠・休憩状態を書き込む。 */
export async function saveSessionLimitState(state: SessionLimitState): Promise<void> {
  await browser.storage.local.set({ sessionLimitState: state.sessionLimitState })
}

/**
 * browser.storage.local から残り時間通知履歴を読み込む。
 * 不正な保存値は空の履歴にフォールバックする。
 */
export async function loadUsageNotificationHistory(): Promise<UsageNotificationHistoryState> {
  const raw = (await browser.storage.local.get(['usageNotificationHistory'])) as {
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
 * browser.storage.local に残り時間通知履歴を書き込む。
 */
export async function saveUsageNotificationHistory(
  state: UsageNotificationHistoryState,
): Promise<void> {
  await browser.storage.local.set({
    usageNotificationHistory: state.usageNotificationHistory,
  })
}
