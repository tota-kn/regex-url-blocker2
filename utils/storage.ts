import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PAUSE_DURATION_MINUTES,
  DEFAULT_PAUSE_WAIT_SECONDS,
  DEFAULT_WAIT_GRANT_MINUTES,
} from './defaults'
import { normalizeDelayGrantState } from './delayGrant'
import { createEffectiveSettingsState } from './effectiveSettings'
import type {
  BlockAction,
  DayOfWeek,
  DelayGrantState,
  EffectiveSettingsState,
  Group,
  GroupMode,
  GroupPauseEntry,
  GroupPauseState,
  MonthDay,
  Restriction,
  RestrictionRule,
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
 */
export const SETTINGS_EXPORT_VERSION = 11

/**
 * エクスポートした設定ファイルの JSON 構造。
 */
export interface SettingsExportFile {
  /** 設定ファイル形式のバージョン。 */
  version: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | typeof SETTINGS_EXPORT_VERSION
  /** storage.sync に保存する設定本体。 */
  settings: Settings
}

/**
 * 旧 `scheduleRules[]` 形式の1ルール。storage.ts 内の移行処理専用。
 * 現行の公開型 `RestrictionRule` とは異なり、フィールドは加算的（ブロック時間帯・上限・待機秒を同時に持てる）。
 */
interface LegacyScheduleRule {
  /** このルールを適用する日の条件。 */
  condition: ScheduleRuleCondition
  /** 条件に一致した日に即ブロックする時間帯。 */
  blockedTimeRanges: TimeRange[]
  /** 条件に一致した日の閲覧上限分数。 */
  dailyLimitMinutes?: number
  /** 条件に一致した日、対象 URL を開くときに課す待機ゲートの秒数。 */
  delaySeconds?: number
}

/**
 * 保存済み値を有効なブロック時動作へ正規化する。
 */
function normalizeBlockAction(value: unknown): BlockAction {
  return value === 'redirect' || value === 'blockedPage'
    ? value
    : DEFAULT_GLOBAL_SETTINGS.blockAction
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
 * `restrictionRules` を優先し、旧 `restriction` や旧 `scheduleRules[]` は複数制限ルールへ移行する。
 */
function normalizeGroup(
  value: unknown,
  fallbackBlockAction = DEFAULT_GLOBAL_SETTINGS.blockAction,
  fallbackRedirectUrl = DEFAULT_GLOBAL_SETTINGS.redirectUrl,
  fallbackPauseWaitSeconds = DEFAULT_PAUSE_WAIT_SECONDS,
  fallbackPauseDurationMinutes = DEFAULT_PAUSE_DURATION_MINUTES,
): Group {
  const g = asRecord(value)
  const blockAction = normalizeBlockAction(g.blockAction ?? fallbackBlockAction)
  const legacyRules =
    normalizeRestrictionRules(g.restrictionRules, g.restriction) ??
    normalizeLegacyRestriction(g.restriction) ??
    convertLegacyScheduleRules(normalizeLegacyScheduleRules(g.scheduleRules, g.dailyRules))
  return {
    id: typeof g.id === 'string' ? g.id : crypto.randomUUID(),
    name: typeof g.name === 'string' ? g.name : '',
    mode: (g.mode === 'blacklist' || g.mode === 'whitelist' ? g.mode : 'blacklist') as GroupMode,
    disabled: g.disabled === true,
    lockMode: g.lockMode === true,
    patterns: Array.isArray(g.patterns) ? g.patterns.filter((p) => typeof p === 'string') : [],
    blockAction,
    redirectUrl: typeof g.redirectUrl === 'string' ? g.redirectUrl : fallbackRedirectUrl,
    pauseWaitSeconds:
      typeof g.pauseWaitSeconds === 'number'
        ? normalizePauseWaitSeconds(g.pauseWaitSeconds)
        : fallbackPauseWaitSeconds,
    pauseDurationMinutes:
      typeof g.pauseDurationMinutes === 'number'
        ? normalizePauseDurationMinutes(g.pauseDurationMinutes)
        : fallbackPauseDurationMinutes,
    timeWindows: normalizeTimeWindows(g.timeWindows) ?? legacyRulesToTimeWindows(legacyRules),
    restrictions:
      normalizeStandaloneRestrictions(g.restrictions) ?? legacyRulesToRestrictions(legacyRules),
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

/**
 * unknown の値から現行フォーマットの単一制限 `RestrictionRule` を生成する。
 * 条件が解釈できない、または type が既知の値でない場合は undefined を返す。
 */
function normalizeRestriction(value: unknown): RestrictionRule | undefined {
  const r = asRecord(value)
  const condition = normalizeScheduleRuleCondition(r.condition)
  if (!condition) return undefined
  if (r.type !== 'block' && r.type !== 'grace' && r.type !== 'wait') return undefined
  const restriction: RestrictionRule = {
    condition,
    timeRanges: Array.isArray(r.timeRanges) ? r.timeRanges.map(normalizeTimeRange) : [],
    type: r.type,
  }
  if (typeof r.graceMinutes === 'number') restriction.graceMinutes = r.graceMinutes
  if (typeof r.waitSeconds === 'number') restriction.waitSeconds = r.waitSeconds
  if (r.type === 'wait') {
    restriction.waitGrantMinutes =
      typeof r.waitGrantMinutes === 'number' && r.waitGrantMinutes >= 1
        ? r.waitGrantMinutes
        : DEFAULT_WAIT_GRANT_MINUTES
  }
  return restriction
}

/** unknown の値から分離形式の制限を生成する。 */
function normalizeStandaloneRestriction(value: unknown): Restriction | undefined {
  const valueRecord = asRecord(value)
  if (
    valueRecord.type !== 'block' &&
    valueRecord.type !== 'redirect' &&
    valueRecord.type !== 'grace' &&
    valueRecord.type !== 'wait'
  )
    return undefined
  const restriction: Restriction = { type: valueRecord.type }
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
  return restriction
}

/** unknown の値から分離形式の制限配列を生成する。 */
function normalizeStandaloneRestrictions(value: unknown): Restriction[] | undefined {
  if (!Array.isArray(value)) return undefined
  const restrictions = value.flatMap((item) => {
    const restriction = normalizeStandaloneRestriction(item)
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
    .filter((minutes): minutes is number => Number.isInteger(minutes) && minutes >= 1)
  const normalized: Restriction[] = []
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

/** 旧ペア形式を時間ウィンドウ配列へ分離する。 */
function legacyRulesToTimeWindows(rules: RestrictionRule[]): TimeWindow[] {
  return rules.map((rule) =>
    rule.condition.type === 'daily' && rule.timeRanges.length === 0
      ? { type: 'always' as const }
      : { type: 'scheduled' as const, condition: rule.condition, timeRanges: rule.timeRanges },
  )
}

/** 旧ペア形式を制限配列へ分離する。 */
function legacyRulesToRestrictions(rules: RestrictionRule[]): Restriction[] {
  return rules.map(({ type, graceMinutes, waitSeconds, waitGrantMinutes }) => ({
    type,
    graceMinutes,
    waitSeconds,
    waitGrantMinutes,
  }))
}

/**
 * unknown の値から現行フォーマットの制限ルール配列を生成する。
 */
function normalizeRestrictionRules(
  value: unknown,
  legacyRestriction?: unknown,
): RestrictionRule[] | undefined {
  if (!Array.isArray(value)) return undefined
  const restrictions = value.flatMap((item) => {
    const restriction = normalizeRestriction(item)
    return restriction ? [restriction] : []
  })
  if (restrictions.length === 0 && legacyRestriction !== undefined) return undefined
  return restrictions
}

/**
 * 旧 `restriction` 単一値を制限ルール配列へ変換する。
 */
function normalizeLegacyRestriction(value: unknown): RestrictionRule[] | undefined {
  const restriction = normalizeRestriction(value)
  return restriction ? [restriction] : undefined
}

/**
 * unknown の値から旧 `scheduleRules[]` 形式の1ルールを生成する。条件が解釈できない要素は undefined を返す。
 */
function normalizeLegacyScheduleRule(value: unknown): LegacyScheduleRule | undefined {
  const rule = asRecord(value)
  const condition = normalizeScheduleRuleCondition(rule.condition)
  if (!condition) return undefined
  return {
    condition,
    blockedTimeRanges: Array.isArray(rule.blockedTimeRanges)
      ? rule.blockedTimeRanges.map(normalizeTimeRange)
      : [],
    dailyLimitMinutes:
      typeof rule.dailyLimitMinutes === 'number' ? rule.dailyLimitMinutes : undefined,
    delaySeconds: typeof rule.delaySeconds === 'number' ? rule.delaySeconds : undefined,
  }
}

/**
 * unknown の値から旧 `scheduleRules[]` 形式のルール配列を生成する。
 * `scheduleRules` が無く旧 `dailyRules` がある場合は weekly / daily ルールへ自動変換する。
 */
function normalizeLegacyScheduleRules(
  value: unknown,
  legacyDailyRules: unknown,
): LegacyScheduleRule[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const rule = normalizeLegacyScheduleRule(item)
      return rule ? [rule] : []
    })
  }
  return convertDailyRulesToLegacyScheduleRules(legacyDailyRules)
}

/**
 * 旧フォーマットの曜日別ルール（`dailyRules`）を旧 `scheduleRules[]` 形式へ変換する。
 * 同一内容（ブロック時間帯・上限）の曜日をまとめて weekly ルール1件にし、全曜日同一なら daily ルールにする。
 */
function convertDailyRulesToLegacyScheduleRules(value: unknown): LegacyScheduleRule[] {
  if (!Array.isArray(value)) return []

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

  return [...byContent.values()].map((entry) => ({
    condition:
      entry.daysOfWeek.size === 7
        ? { type: 'daily' as const }
        : { type: 'weekly' as const, daysOfWeek: [...entry.daysOfWeek].toSorted((a, b) => a - b) },
    blockedTimeRanges: entry.blockedTimeRanges,
    dailyLimitMinutes: entry.dailyLimitMinutes,
  }))
}

/**
 * 旧 `scheduleRules[]`（または旧 `dailyRules` 変換結果）を現行の複数制限ルールへ変換する。
 * 旧1ルールにブロック時間帯・上限・待機秒が同時にあれば、それぞれ別の制限ルールとして保持する。
 */
function convertLegacyScheduleRules(rules: LegacyScheduleRule[]): RestrictionRule[] {
  const blockRestrictions: RestrictionRule[] = []
  const graceRestrictions: RestrictionRule[] = []
  const waitRestrictions: RestrictionRule[] = []
  for (const rule of rules) {
    if (rule.blockedTimeRanges.length > 0) {
      blockRestrictions.push({
        condition: rule.condition,
        timeRanges: rule.blockedTimeRanges,
        type: 'block',
      })
    }
    if (rule.dailyLimitMinutes !== undefined) {
      graceRestrictions.push({
        condition: rule.condition,
        timeRanges: [],
        type: 'grace',
        graceMinutes: rule.dailyLimitMinutes,
      })
    }
    if (rule.delaySeconds !== undefined && rule.delaySeconds > 0) {
      waitRestrictions.push({
        condition: rule.condition,
        timeRanges: [],
        type: 'wait',
        waitSeconds: rule.delaySeconds,
        waitGrantMinutes: DEFAULT_WAIT_GRANT_MINUTES,
      })
    }
  }
  return [...blockRestrictions, ...graceRestrictions, ...waitRestrictions]
}

/**
 * unknown の値から `Settings` を生成し、欠損フィールドを補完する。
 */
function normalizeSettings(raw: { global?: unknown; groups?: unknown }): Settings {
  const rawGlobal = asRecord(raw.global)
  const normalizedRawGlobal = { ...rawGlobal }
  delete normalizedRawGlobal.pageOpenNotificationsEnabled
  delete normalizedRawGlobal.blockNotificationsEnabled
  delete normalizedRawGlobal.pauseWaitSeconds
  delete normalizedRawGlobal.pauseDurationMinutes
  const fallbackBlockAction = normalizeBlockAction(rawGlobal.blockAction)
  const fallbackRedirectUrl =
    typeof rawGlobal.redirectUrl === 'string'
      ? rawGlobal.redirectUrl
      : DEFAULT_GLOBAL_SETTINGS.redirectUrl
  const notificationThresholdMinutes = normalizeNotificationThresholdMinutes(
    rawGlobal.notificationThresholdMinutes,
  )
  const pauseWaitSeconds = normalizePauseWaitSeconds(rawGlobal.pauseWaitSeconds)
  const pauseDurationMinutes = normalizePauseDurationMinutes(rawGlobal.pauseDurationMinutes)
  return {
    global: {
      ...DEFAULT_GLOBAL_SETTINGS,
      ...normalizedRawGlobal,
      blockAction: fallbackBlockAction,
      redirectUrl: fallbackRedirectUrl,
      notificationThresholdMinutes,
      remainingTimeNotificationsEnabled: normalizeRemainingTimeNotificationsEnabled(
        rawGlobal.remainingTimeNotificationsEnabled,
        rawGlobal.notificationThresholdMinutes,
      ),
    },
    groups: Array.isArray(raw.groups)
      ? raw.groups.map((group) =>
          normalizeGroup(
            group,
            fallbackBlockAction,
            fallbackRedirectUrl,
            pauseWaitSeconds,
            pauseDurationMinutes,
          ),
        )
      : [],
  }
}

/**
 * browser.storage.sync から `Settings` 全体を読み込む。
 * 未設定キーや欠損フィールドは `DEFAULT_GLOBAL_SETTINGS` で穴埋めする。
 * 旧 `dailyRules` や旧 `scheduleRules` は `restrictionRules` へ自動変換し、それ以前の旧フォーマット
 * （`schedules` / `blockedTimeSlots` / `timeLimits`）は破棄して空の `restrictionRules` で初期化する。
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

  const file = asRecord(parsed)
  if (
    file.version !== 2 &&
    file.version !== 3 &&
    file.version !== 4 &&
    file.version !== 5 &&
    file.version !== 6 &&
    file.version !== 7 &&
    file.version !== 8 &&
    file.version !== 9 &&
    file.version !== 10 &&
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
