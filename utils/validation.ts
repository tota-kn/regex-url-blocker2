import type { DailyRule, DayOfWeek, GlobalSettings, Group, TimeRange } from './types'
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

  if (!Number.isInteger(settings.notificationThresholdMinutes) || settings.notificationThresholdMinutes < 0) {
    errors.push({ field: 'notificationThresholdMinutes', message: 'Use 0+ integer' })
  }

  if (typeof settings.pageOpenNotificationsEnabled !== 'boolean') {
    errors.push({ field: 'pageOpenNotificationsEnabled', message: 'Use true or false' })
  }

  if (typeof settings.blockNotificationsEnabled !== 'boolean') {
    errors.push({ field: 'blockNotificationsEnabled', message: 'Use true or false' })
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

/**
 * 1曜日分の制限ルールをバリデーションし、エラー配列を返す。
 */
function validateDailyRule(rule: DailyRule, prefix: string): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isValidDayOfWeek(rule.dayOfWeek)) {
    errors.push({ field: `${prefix}.dayOfWeek`, message: 'Use day 0-6' })
  }
  rule.blockedTimeRanges.forEach((range, i) => {
    errors.push(...validateTimeRange(range, `${prefix}.blockedTimeRanges[${i}]`))
  })
  if (rule.dailyLimitMinutes !== undefined && (!Number.isInteger(rule.dailyLimitMinutes) || rule.dailyLimitMinutes < 0)) {
    errors.push({ field: `${prefix}.dailyLimitMinutes`, message: 'Use 0+ integer or empty' })
  }
  return errors
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

  if (group.dailyRules.length !== 7) {
    errors.push({ field: 'dailyRules', message: 'Use 7 daily rules' })
  }
  const days = group.dailyRules.map(rule => rule.dayOfWeek)
  if (days.some(day => !isValidDayOfWeek(day)) || new Set(days).size !== 7) {
    errors.push({ field: 'dailyRules', message: 'Use each day 0-6 once' })
  }
  group.dailyRules.forEach((rule, i) => {
    errors.push(...validateDailyRule(rule, `dailyRules[${i}]`))
  })

  return errors
}
