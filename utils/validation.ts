import type {
  DayOfWeek,
  GlobalSettings,
  Group,
  MonthDay,
  Restriction,
  ScheduleRuleCondition,
  TimeRange,
  TimeWindow,
} from './types'
import { isValidUrlPattern } from './urlPatterns'

/** UI と検証ロジックで共有する、入力要件を説明するエラーメッセージ。 */
export const VALIDATION_MESSAGES = {
  required: 'Enter a name.',
  urlPattern: 'Enter a valid URL pattern or regular expression.',
  url: 'Enter a valid URL, including http:// or https://.',
  wholeNumberZeroOrGreater: 'Enter a whole number of 0 or greater.',
  wholeNumberOneOrGreater: 'Enter a whole number of 1 or greater.',
  time: 'Enter a time in HH:MM format (00:00–23:59).',
  timeRange: 'Enter time ranges as HH:MM-HH:MM, separated by commas.',
  daysOfWeek: 'Select at least one day of the week.',
  daysOfMonth: 'Enter one or more days from 1 to 31, separated by commas.',
  monthDay: 'Enter a valid date in MM/DD format.',
  patterns: 'Add at least one URL pattern.',
  timeWindows: 'Add at least one time window.',
  restrictions: 'Add at least one restriction.',
  duplicateRestriction: 'Only one restriction of this type is allowed.',
} as const

/**
 * バリデーションエラーの単位。`field` はフィールドへのドット区切りパス。
 */
export interface ValidationError {
  field: string
  message: string
}

/** グループ検証の動作オプション。 */
export interface ValidateGroupOptions {
  /** 保存UIで必要な各設定セクションが最低1件あることを要求する。 */
  requireConfiguredSections?: boolean
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * 文字列が "HH:MM" 形式（00:00–23:59、0埋め2桁）であるかを返す。
 */
export function isValidHHMM(value: string): boolean {
  return HHMM_RE.test(value)
}

/**
 * グローバル設定をバリデーションし、エラー配列を返す。エラーがなければ空配列。
 */
export function validateGlobalSettings(settings: GlobalSettings): ValidationError[] {
  const errors: ValidationError[] = []

  if (settings.blockAction !== 'redirect' && settings.blockAction !== 'blockedPage') {
    errors.push({ field: 'blockAction', message: 'Invalid action' })
  }

  if (settings.blockAction === 'redirect') {
    if (settings.redirectUrl.trim().length === 0) {
      errors.push({ field: 'redirectUrl', message: VALIDATION_MESSAGES.url })
    } else {
      try {
        new URL(settings.redirectUrl)
      } catch {
        errors.push({ field: 'redirectUrl', message: VALIDATION_MESSAGES.url })
      }
    }
  }

  if (!isValidHHMM(settings.dailyResetHour)) {
    errors.push({ field: 'dailyResetHour', message: VALIDATION_MESSAGES.time })
  }

  if (
    !Number.isInteger(settings.notificationThresholdMinutes) ||
    settings.notificationThresholdMinutes < 1
  ) {
    errors.push({
      field: 'notificationThresholdMinutes',
      message: VALIDATION_MESSAGES.wholeNumberOneOrGreater,
    })
  }

  if (typeof settings.remainingTimeNotificationsEnabled !== 'boolean') {
    errors.push({ field: 'remainingTimeNotificationsEnabled', message: 'Use true or false' })
  }

  return errors
}

/**
 * 値が `DayOfWeek` の範囲（0..6 の整数）であるかを返す。
 */
function isValidDayOfWeek(value: unknown): value is DayOfWeek {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6
}

/**
 * 分が日内時刻として有効かを返す。
 */
function isValidMinute(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1440
}

/**
 * 1つの時間帯をバリデーションし、エラー配列を返す。
 */
function validateTimeRange(range: TimeRange, prefix: string): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isValidMinute(range.startMinute)) {
    errors.push({ field: `${prefix}.startMinute`, message: VALIDATION_MESSAGES.timeRange })
  }
  if (!isValidMinute(range.endMinute)) {
    errors.push({ field: `${prefix}.endMinute`, message: VALIDATION_MESSAGES.timeRange })
  }
  return errors
}

/** 月ごとの最大日数（2月は閏年の29日を許容）。 */
const MAX_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * 月日が実在しうる日付（2/29 は許容、2/30 は拒否）であるかを返す。
 */
function isValidMonthDay(value: MonthDay): boolean {
  if (!Number.isInteger(value.month) || value.month < 1 || value.month > 12) return false
  return (
    Number.isInteger(value.day) && value.day >= 1 && value.day <= MAX_DAYS_IN_MONTH[value.month - 1]
  )
}

/**
 * スケジュールルールの適用条件をバリデーションし、エラー配列を返す。
 */
function validateScheduleRuleCondition(
  condition: ScheduleRuleCondition,
  prefix: string,
): ValidationError[] {
  const errors: ValidationError[] = []
  if (condition.type === 'weekly') {
    if (condition.daysOfWeek.length === 0) {
      errors.push({
        field: `${prefix}.condition.daysOfWeek`,
        message: VALIDATION_MESSAGES.daysOfWeek,
      })
    }
    if (
      condition.daysOfWeek.some((day: DayOfWeek) => !isValidDayOfWeek(day)) ||
      new Set(condition.daysOfWeek).size !== condition.daysOfWeek.length
    ) {
      errors.push({
        field: `${prefix}.condition.daysOfWeek`,
        message: VALIDATION_MESSAGES.daysOfWeek,
      })
    }
  } else if (condition.type === 'monthly') {
    if (condition.daysOfMonth.length === 0) {
      errors.push({
        field: `${prefix}.condition.daysOfMonth`,
        message: VALIDATION_MESSAGES.daysOfMonth,
      })
    }
    if (
      condition.daysOfMonth.some((day: number) => !Number.isInteger(day) || day < 1 || day > 31) ||
      new Set(condition.daysOfMonth).size !== condition.daysOfMonth.length
    ) {
      errors.push({
        field: `${prefix}.condition.daysOfMonth`,
        message: VALIDATION_MESSAGES.daysOfMonth,
      })
    }
  } else if (condition.type === 'period') {
    if (!isValidMonthDay(condition.start)) {
      errors.push({ field: `${prefix}.condition.start`, message: VALIDATION_MESSAGES.monthDay })
    }
    if (!isValidMonthDay(condition.end)) {
      errors.push({ field: `${prefix}.condition.end`, message: VALIDATION_MESSAGES.monthDay })
    }
  }
  return errors
}

/** 分離形式の時間ウィンドウをバリデーションする。 */
function validateTimeWindow(window: TimeWindow, prefix: string): ValidationError[] {
  if (window.type === 'always') return []
  const errors = validateScheduleRuleCondition(window.condition, prefix)
  window.timeRanges.forEach((range, index) =>
    errors.push(...validateTimeRange(range, `${prefix}.timeRanges[${index}]`)),
  )
  return errors
}

/** 分離形式の制限をバリデーションする。 */
function validateStandaloneRestriction(
  restriction: Restriction,
  prefix: string,
): ValidationError[] {
  if (
    restriction.type === 'grace' &&
    (restriction.graceMinutes === undefined ||
      !Number.isInteger(restriction.graceMinutes) ||
      restriction.graceMinutes < 0)
  ) {
    return [
      { field: `${prefix}.graceMinutes`, message: VALIDATION_MESSAGES.wholeNumberZeroOrGreater },
    ]
  }
  if (
    restriction.type === 'wait' &&
    (restriction.waitSeconds === undefined ||
      !Number.isInteger(restriction.waitSeconds) ||
      restriction.waitSeconds < 0)
  ) {
    return [
      { field: `${prefix}.waitSeconds`, message: VALIDATION_MESSAGES.wholeNumberZeroOrGreater },
    ]
  }
  if (
    restriction.type === 'wait' &&
    (restriction.waitGrantMinutes === undefined ||
      !Number.isInteger(restriction.waitGrantMinutes) ||
      restriction.waitGrantMinutes < 1)
  ) {
    return [
      { field: `${prefix}.waitGrantMinutes`, message: VALIDATION_MESSAGES.wholeNumberOneOrGreater },
    ]
  }
  if (restriction.type === 'redirect') {
    const url = restriction.redirectUrl ?? ''
    if (url.trim().length === 0) {
      return [{ field: `${prefix}.redirectUrl`, message: VALIDATION_MESSAGES.url }]
    }
    try {
      new URL(url)
    } catch {
      return [{ field: `${prefix}.redirectUrl`, message: VALIDATION_MESSAGES.url }]
    }
  }
  return []
}

/**
 * グループをバリデーションし、エラー配列を返す。エラーがなければ空配列。
 */
export function validateGroup(group: Group, options: ValidateGroupOptions = {}): ValidationError[] {
  const errors: ValidationError[] = []

  if (group.mode !== 'blacklist' && group.mode !== 'whitelist') {
    errors.push({ field: 'mode', message: 'Invalid mode' })
  }

  if (group.name.trim().length === 0) {
    errors.push({ field: 'name', message: VALIDATION_MESSAGES.required })
  }

  if (group.blockAction !== 'redirect' && group.blockAction !== 'blockedPage') {
    errors.push({ field: 'blockAction', message: 'Invalid action' })
  }

  if (group.blockAction === 'redirect') {
    if (group.redirectUrl.trim().length === 0) {
      errors.push({ field: 'redirectUrl', message: VALIDATION_MESSAGES.url })
    } else {
      try {
        new URL(group.redirectUrl)
      } catch {
        errors.push({ field: 'redirectUrl', message: VALIDATION_MESSAGES.url })
      }
    }
  }

  if (
    group.pauseWaitSeconds !== undefined &&
    (!Number.isInteger(group.pauseWaitSeconds) || group.pauseWaitSeconds < 0)
  ) {
    errors.push({
      field: 'pauseWaitSeconds',
      message: VALIDATION_MESSAGES.wholeNumberZeroOrGreater,
    })
  }

  if (
    group.pauseDurationMinutes !== undefined &&
    (!Number.isInteger(group.pauseDurationMinutes) || group.pauseDurationMinutes < 1)
  ) {
    errors.push({
      field: 'pauseDurationMinutes',
      message: VALIDATION_MESSAGES.wholeNumberOneOrGreater,
    })
  }

  group.patterns.forEach((p, i) => {
    if (!isValidUrlPattern(p)) {
      errors.push({ field: `patterns[${i}]`, message: VALIDATION_MESSAGES.urlPattern })
    }
  })

  if (options.requireConfiguredSections && (group.patterns ?? []).length === 0) {
    errors.push({ field: 'patterns', message: VALIDATION_MESSAGES.patterns })
  }
  if (options.requireConfiguredSections && (group.timeWindows ?? []).length === 0) {
    errors.push({ field: 'timeWindows', message: VALIDATION_MESSAGES.timeWindows })
  }
  if (options.requireConfiguredSections && (group.restrictions ?? []).length === 0) {
    errors.push({ field: 'restrictions', message: VALIDATION_MESSAGES.restrictions })
  }
  ;(group.timeWindows ?? []).forEach((window, index) =>
    errors.push(...validateTimeWindow(window, `timeWindows[${index}]`)),
  )
  ;(group.restrictions ?? []).forEach((restriction, index) =>
    errors.push(...validateStandaloneRestriction(restriction, `restrictions[${index}]`)),
  )
  const seenTypes = new Set<string>()
  ;(group.restrictions ?? []).forEach((restriction, index) => {
    const key =
      restriction.type === 'block' || restriction.type === 'redirect' ? 'hard' : restriction.type
    if (seenTypes.has(key)) {
      errors.push({
        field: `restrictions[${index}].type`,
        message:
          key === 'hard'
            ? 'Choose either Block or Redirect, not both.'
            : VALIDATION_MESSAGES.duplicateRestriction,
      })
    }
    seenTypes.add(key)
  })

  return errors
}
