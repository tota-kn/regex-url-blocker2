import type { BlockedTimeSlot, DayOfWeek, GlobalSettings, Group, TimeLimit } from './types'

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
 * 値が `DayOfWeek` の範囲（0..6 の整数）であるかを返す。
 */
function isValidDayOfWeek(value: unknown): value is DayOfWeek {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6
}

/**
 * `daysOfWeek` 配列の共通バリデーション（範囲チェック・重複チェック）。
 */
function validateDaysOfWeek(days: DayOfWeek[], prefix: string): ValidationError[] {
  const errors: ValidationError[] = []
  if (days.some(d => !isValidDayOfWeek(d))) {
    errors.push({ field: `${prefix}.daysOfWeek`, message: '曜日は 0〜6 で指定してください' })
  }
  if (new Set(days).size !== days.length) {
    errors.push({ field: `${prefix}.daysOfWeek`, message: '曜日が重複しています' })
  }
  return errors
}

/**
 * 1つのブロック時間帯をバリデーションし、エラー配列を返す。
 * `prefix` は `blockedTimeSlots[0]` のようなフィールドパスのプレフィックス。
 */
function validateBlockedTimeSlot(slot: BlockedTimeSlot, prefix: string): ValidationError[] {
  const errors: ValidationError[] = []
  errors.push(...validateDaysOfWeek(slot.daysOfWeek, prefix))
  if (!isValidHHMM(slot.start)) {
    errors.push({ field: `${prefix}.start`, message: 'HH:MM 形式で入力してください' })
  }
  if (!isValidHHMM(slot.end)) {
    errors.push({ field: `${prefix}.end`, message: 'HH:MM 形式で入力してください' })
  }
  return errors
}

/**
 * 1つの上限エントリをバリデーションし、エラー配列を返す。
 * `prefix` は `timeLimits[0]` のようなフィールドパスのプレフィックス。
 */
function validateTimeLimit(limit: TimeLimit, prefix: string): ValidationError[] {
  const errors: ValidationError[] = []
  errors.push(...validateDaysOfWeek(limit.daysOfWeek, prefix))
  if (!Number.isInteger(limit.dailyMinutes) || limit.dailyMinutes < 0) {
    errors.push({ field: `${prefix}.dailyMinutes`, message: '0 以上の整数を入力してください' })
  }
  return errors
}

/**
 * グループをバリデーションし、エラー配列を返す。エラーがなければ空配列。
 */
export function validateGroup(group: Group): ValidationError[] {
  const errors: ValidationError[] = []

  if (group.mode !== 'blacklist' && group.mode !== 'whitelist') {
    errors.push({ field: 'mode', message: 'モードが不正です' })
  }

  if (group.name.trim().length === 0) {
    errors.push({ field: 'name', message: '名前は必須です' })
  }

  group.patterns.forEach((p, i) => {
    if (!isValidRegex(p)) {
      errors.push({ field: `patterns[${i}]`, message: '無効な正規表現です' })
    }
  })

  group.blockedTimeSlots.forEach((slot, i) => {
    errors.push(...validateBlockedTimeSlot(slot, `blockedTimeSlots[${i}]`))
  })

  group.timeLimits.forEach((limit, i) => {
    errors.push(...validateTimeLimit(limit, `timeLimits[${i}]`))
  })

  return errors
}
