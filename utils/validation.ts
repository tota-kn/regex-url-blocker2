import type { GlobalSettings, Group } from './types'

/**
 * バリデーションエラーの単位。`field` はフィールドへのドット区切りパス。
 */
export interface ValidationError {
  field: string
  message: string
}

/**
 * 与えられた文字列が `new RegExp()` で構文解析可能かを返す。空文字は false。
 */
export function isValidRegex(pattern: string): boolean {
  if (pattern.length === 0) return false
  try {
    new RegExp(pattern)
    return true
  }
  catch {
    return false
  }
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

  if (settings.redirectUrl.trim().length === 0) {
    errors.push({ field: 'redirectUrl', message: '有効な URL を入力してください' })
  }
  else {
    try {
      new URL(settings.redirectUrl)
    }
    catch {
      errors.push({ field: 'redirectUrl', message: '有効な URL を入力してください' })
    }
  }

  if (!isValidHHMM(settings.dailyResetHour)) {
    errors.push({ field: 'dailyResetHour', message: 'HH:MM 形式で入力してください' })
  }

  return errors
}

/**
 * グループをバリデーションし、エラー配列を返す。エラーがなければ空配列。
 */
export function validateGroup(group: Group): ValidationError[] {
  const errors: ValidationError[] = []

  if (group.name.trim().length === 0) {
    errors.push({ field: 'name', message: '名前は必須です' })
  }

  group.patterns.forEach((p, i) => {
    if (!isValidRegex(p)) {
      errors.push({ field: `patterns[${i}]`, message: '無効な正規表現です' })
    }
  })

  const limit = group.dailyTimeLimitMinutes
  if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
    errors.push({ field: 'dailyTimeLimitMinutes', message: '0 以上の整数を入力してください' })
  }

  group.allowedHours.forEach((r, i) => {
    if (!isValidHHMM(r.start)) {
      errors.push({ field: `allowedHours[${i}].start`, message: 'HH:MM 形式で入力してください' })
    }
    if (!isValidHHMM(r.end)) {
      errors.push({ field: `allowedHours[${i}].end`, message: 'HH:MM 形式で入力してください' })
    }
  })

  return errors
}
