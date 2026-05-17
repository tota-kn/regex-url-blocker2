import type { DailyRule, DayOfWeek, GlobalSettings, Group } from './types'

/**
 * 新規グループ作成時に選べるテンプレート識別子。
 */
export type GroupTemplateId = 'blank' | '30min' | 'block-nights' | 'allow-nights'

/**
 * 未設定時に使用するグローバル設定の既定値。SPEC.md 準拠。
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  blockAction: 'redirect',
  redirectUrl: 'https://example.com',
  dailyResetHour: '00:00',
  notificationThresholdMinutes: 5,
}

/**
 * 曜日別ルールを空の状態で7件生成する。
 */
export function createEmptyDailyRules(): DailyRule[] {
  return ([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map(dayOfWeek => ({
    dayOfWeek,
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
  }))
}

/**
 * 指定テンプレートに対応する曜日別ルールを7件生成する。
 */
function createDailyRulesFromTemplate(templateId: GroupTemplateId): DailyRule[] {
  if (templateId === '30min') {
    return createEmptyDailyRules().map(rule => ({ ...rule, dailyLimitMinutes: 30 }))
  }
  if (templateId === 'block-nights') {
    return createEmptyDailyRules().map(rule => ({
      ...rule,
      blockedTimeRanges: [{ startMinute: 1260, endMinute: 360 }],
    }))
  }
  if (templateId === 'allow-nights') {
    return createEmptyDailyRules().map(rule => ({
      ...rule,
      blockedTimeRanges: [{ startMinute: 360, endMinute: 1260 }],
    }))
  }
  return createEmptyDailyRules()
}

/**
 * 指定テンプレートを初期値にした新規グループを生成する。
 * @param templateId 新規作成時のプリセット。
 * @param name グループ名。省略時は空文字。
 */
export function createGroupFromTemplate(templateId: GroupTemplateId, name = ''): Group {
  return {
    id: crypto.randomUUID(),
    name,
    mode: 'blacklist',
    lockMode: false,
    patterns: [],
    dailyRules: createDailyRulesFromTemplate(templateId),
  }
}

/**
 * 新規グループを生成する。`id` は crypto.randomUUID() で採番。
 * @param name グループ名。省略時は空文字。
 */
export function createEmptyGroup(name = ''): Group {
  return createGroupFromTemplate('blank', name)
}
