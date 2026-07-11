import type { DayOfWeek, GlobalSettings, Group, MonthDay, Restriction, RestrictionRule, ScheduleRuleCondition, TimeRange, TimeWindow } from './types'
import { isValidUrlPattern } from './urlPatterns'

/**
 * バリデーションエラーの単位。`field` はフィールドへのドット区切りパス。
 */
export interface ValidationError {
  field: string
  message: string
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
      errors.push({ field: 'redirectUrl', message: 'Invalid URL' })
    }
    else {
      try {
        new URL(settings.redirectUrl)
      }
      catch {
        errors.push({ field: 'redirectUrl', message: 'Invalid URL' })
      }
    }
  }

  if (!isValidHHMM(settings.dailyResetHour)) {
    errors.push({ field: 'dailyResetHour', message: 'Use HH:MM' })
  }

  if (!Number.isInteger(settings.notificationThresholdMinutes) || settings.notificationThresholdMinutes < 1) {
    errors.push({ field: 'notificationThresholdMinutes', message: 'Use 1+ integer' })
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
    errors.push({ field: `${prefix}.startMinute`, message: 'Use minute 0-1440' })
  }
  if (!isValidMinute(range.endMinute)) {
    errors.push({ field: `${prefix}.endMinute`, message: 'Use minute 0-1440' })
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
  return Number.isInteger(value.day) && value.day >= 1 && value.day <= MAX_DAYS_IN_MONTH[value.month - 1]
}

/**
 * スケジュールルールの適用条件をバリデーションし、エラー配列を返す。
 */
function validateScheduleRuleCondition(condition: ScheduleRuleCondition, prefix: string): ValidationError[] {
  const errors: ValidationError[] = []
  if (condition.type === 'weekly') {
    if (condition.daysOfWeek.length === 0) {
      errors.push({ field: `${prefix}.condition.daysOfWeek`, message: 'Select 1+ days' })
    }
    if (condition.daysOfWeek.some((day: DayOfWeek) => !isValidDayOfWeek(day)) || new Set(condition.daysOfWeek).size !== condition.daysOfWeek.length) {
      errors.push({ field: `${prefix}.condition.daysOfWeek`, message: 'Use each day 0-6 once' })
    }
  }
  else if (condition.type === 'monthly') {
    if (condition.daysOfMonth.length === 0) {
      errors.push({ field: `${prefix}.condition.daysOfMonth`, message: 'Use days 1-31' })
    }
    if (condition.daysOfMonth.some((day: number) => !Number.isInteger(day) || day < 1 || day > 31) || new Set(condition.daysOfMonth).size !== condition.daysOfMonth.length) {
      errors.push({ field: `${prefix}.condition.daysOfMonth`, message: 'Use days 1-31' })
    }
  }
  else if (condition.type === 'period') {
    if (!isValidMonthDay(condition.start)) {
      errors.push({ field: `${prefix}.condition.start`, message: 'Use MM/DD' })
    }
    if (!isValidMonthDay(condition.end)) {
      errors.push({ field: `${prefix}.condition.end`, message: 'Use MM/DD' })
    }
  }
  return errors
}

/**
 * グループの単一制限をバリデーションし、エラー配列を返す。
 */
function validateRestriction(restriction: RestrictionRule, prefix: string): ValidationError[] {
  const errors: ValidationError[] = validateScheduleRuleCondition(restriction.condition, prefix)
  restriction.timeRanges.forEach((range: TimeRange, i: number) => {
    errors.push(...validateTimeRange(range, `${prefix}.timeRanges[${i}]`))
  })
  if (restriction.type === 'grace' && (restriction.graceMinutes === undefined || !Number.isInteger(restriction.graceMinutes) || restriction.graceMinutes < 0)) {
    errors.push({ field: `${prefix}.graceMinutes`, message: 'Use 0+ integer' })
  }
  if (restriction.type === 'wait' && (restriction.waitSeconds === undefined || !Number.isInteger(restriction.waitSeconds) || restriction.waitSeconds < 0)) {
    errors.push({ field: `${prefix}.waitSeconds`, message: 'Use 0+ integer' })
  }
  return errors
}

/** 分離形式の時間ウィンドウをバリデーションする。 */
function validateTimeWindow(window: TimeWindow, prefix: string): ValidationError[] {
  if (window.type === 'always') return []
  const errors = validateScheduleRuleCondition(window.condition, prefix)
  window.timeRanges.forEach((range, index) => errors.push(...validateTimeRange(range, `${prefix}.timeRanges[${index}]`)))
  return errors
}

/** 分離形式の制限をバリデーションする。 */
function validateStandaloneRestriction(restriction: Restriction, prefix: string): ValidationError[] {
  if (restriction.type === 'grace' && (restriction.graceMinutes === undefined || !Number.isInteger(restriction.graceMinutes) || restriction.graceMinutes < 0)) {
    return [{ field: `${prefix}.graceMinutes`, message: 'Use 0+ integer' }]
  }
  if (restriction.type === 'wait' && (restriction.waitSeconds === undefined || !Number.isInteger(restriction.waitSeconds) || restriction.waitSeconds < 0)) {
    return [{ field: `${prefix}.waitSeconds`, message: 'Use 0+ integer' }]
  }
  if (restriction.type === 'redirect') {
    const url = restriction.redirectUrl ?? ''
    if (url.trim().length === 0) {
      return [{ field: `${prefix}.redirectUrl`, message: 'Invalid URL' }]
    }
    try {
      new URL(url)
    }
    catch {
      return [{ field: `${prefix}.redirectUrl`, message: 'Invalid URL' }]
    }
  }
  return []
}

/**
 * グループをバリデーションし、エラー配列を返す。エラーがなければ空配列。
 */
export function validateGroup(group: Group): ValidationError[] {
  const errors: ValidationError[] = []

  if (group.mode !== 'blacklist' && group.mode !== 'whitelist') {
    errors.push({ field: 'mode', message: 'Invalid mode' })
  }

  if (group.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Required' })
  }

  if (group.blockAction !== 'redirect' && group.blockAction !== 'blockedPage') {
    errors.push({ field: 'blockAction', message: 'Invalid action' })
  }

  if (group.blockAction === 'redirect') {
    if (group.redirectUrl.trim().length === 0) {
      errors.push({ field: 'redirectUrl', message: 'Invalid URL' })
    }
    else {
      try {
        new URL(group.redirectUrl)
      }
      catch {
        errors.push({ field: 'redirectUrl', message: 'Invalid URL' })
      }
    }
  }

  group.patterns.forEach((p, i) => {
    if (!isValidUrlPattern(p)) {
      errors.push({ field: `patterns[${i}]`, message: 'Invalid URL pattern' })
    }
  })

  if (group.timeWindows !== undefined || group.restrictions !== undefined) {
    ;(group.timeWindows ?? []).forEach((window, index) => errors.push(...validateTimeWindow(window, `timeWindows[${index}]`)))
    ;(group.restrictions ?? []).forEach((restriction, index) => errors.push(...validateStandaloneRestriction(restriction, `restrictions[${index}]`)))
  }
  else {
    const restrictions = group.restrictionRules?.length ? group.restrictionRules : (group.restriction ? [group.restriction] : [])
    restrictions.forEach((restriction, index) => {
      errors.push(...validateRestriction(restriction, `restrictionRules[${index}]`))
    })
  }

  return errors
}
