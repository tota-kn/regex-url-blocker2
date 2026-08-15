import type {
  BlockDestination,
  DayOfWeek,
  GlobalSettings,
  Group,
  MonthDay,
  Rule,
  ScheduleRuleCondition,
  TimeRange,
  TimeWindow,
} from './types'
import { isValidUrlPattern } from './urlPatterns'
import { translate } from './i18n'

/** UI と検証ロジックで共有する、入力要件を説明するエラーメッセージ。 */
export const VALIDATION_MESSAGES = {
  get required() {
    return translate('Enter a name.')
  },
  get urlPattern() {
    return translate('Enter a valid URL pattern or regular expression.')
  },
  get url() {
    return translate('Enter a valid URL, including http:// or https://.')
  },
  get wholeNumberZeroOrGreater() {
    return translate('Enter a whole number of 0 or greater.')
  },
  get wholeNumberOneOrGreater() {
    return translate('Enter a whole number of 1 or greater.')
  },
  get time() {
    return translate('Enter a time in HH:MM format (00:00–23:59).')
  },
  get timeRange() {
    return translate('Enter time ranges as HH:MM-HH:MM, separated by commas.')
  },
  get daysOfWeek() {
    return translate('Select at least one day of the week.')
  },
  get daysOfMonth() {
    return translate('Enter one or more days from 1 to 31, separated by commas.')
  },
  get monthDay() {
    return translate('Enter a valid date in MM/DD format.')
  },
  get patterns() {
    return translate('Add at least one URL pattern.')
  },
  get rules() {
    return translate('Add at least one rule.')
  },
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

/** ブロック時の遷移先をバリデーションする。 */
function validateBlockDestination(
  destination: BlockDestination | undefined,
  prefix: string,
): ValidationError[] {
  if (!destination || destination.type !== 'redirect') return []
  if (destination.url.trim().length === 0) {
    return [{ field: `${prefix}.destination`, message: VALIDATION_MESSAGES.url }]
  }
  try {
    new URL(destination.url)
  } catch {
    return [{ field: `${prefix}.destination`, message: VALIDATION_MESSAGES.url }]
  }
  return []
}

/** 1件のルールをバリデーションする。 */
function validateRule(rule: Rule, prefix: string): ValidationError[] {
  const errors = validateTimeWindow(rule.window, `${prefix}.window`)
  const restriction = rule.restriction

  // 0 分は Block と同義だが解除タイミングの意味論が違うため、Block ルールへ誘導する。
  if (restriction.kind === 'dailyLimit') {
    if (!Number.isInteger(restriction.minutes) || restriction.minutes < 1) {
      errors.push({
        field: `${prefix}.restriction.minutes`,
        message: VALIDATION_MESSAGES.wholeNumberOneOrGreater,
      })
    }
  }
  if (restriction.kind === 'wait') {
    if (!Number.isInteger(restriction.seconds) || restriction.seconds < 0) {
      errors.push({
        field: `${prefix}.restriction.seconds`,
        message: VALIDATION_MESSAGES.wholeNumberZeroOrGreater,
      })
    }
    if (!Number.isInteger(restriction.grantMinutes) || restriction.grantMinutes < 1) {
      errors.push({
        field: `${prefix}.restriction.grantMinutes`,
        message: VALIDATION_MESSAGES.wholeNumberOneOrGreater,
      })
    }
  }
  if (restriction.kind !== 'wait') {
    errors.push(...validateBlockDestination(rule.destination, prefix))
  }
  return errors
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

  if (!Number.isInteger(group.pauseWaitSeconds) || group.pauseWaitSeconds < 0) {
    errors.push({
      field: 'pauseWaitSeconds',
      message: VALIDATION_MESSAGES.wholeNumberZeroOrGreater,
    })
  }

  if (!Number.isInteger(group.pauseDurationMinutes) || group.pauseDurationMinutes < 1) {
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

  if (options.requireConfiguredSections && group.patterns.length === 0) {
    errors.push({ field: 'patterns', message: VALIDATION_MESSAGES.patterns })
  }
  if (options.requireConfiguredSections && group.rules.length === 0) {
    errors.push({ field: 'rules', message: VALIDATION_MESSAGES.rules })
  }
  group.rules.forEach((rule, index) => errors.push(...validateRule(rule, `rules[${index}]`)))

  return errors
}
