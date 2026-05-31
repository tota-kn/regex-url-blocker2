import type { DailyRule, DayOfWeek, GlobalSettings, Group } from './types'

/**
 * 新規グループ作成時に選べるテンプレート識別子。
 */
export type GroupTemplateId = 'blank' | 'core-sns-15min' | 'video-30min' | 'work-hours-focus'

/**
 * 未設定時に使用するグローバル設定の既定値。SPEC.md 準拠。
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  blockAction: 'blockedPage',
  redirectUrl: 'https://example.com',
  dailyResetHour: '03:00',
  remainingTimeNotificationsEnabled: true,
  notificationThresholdMinutes: 5,
  pageOpenNotificationsEnabled: true,
  blockNotificationsEnabled: true,
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
  if (templateId === 'core-sns-15min') {
    return createEmptyDailyRules().map(rule => ({ ...rule, dailyLimitMinutes: 15 }))
  }
  if (templateId === 'video-30min') {
    return createEmptyDailyRules().map(rule => ({ ...rule, dailyLimitMinutes: 30 }))
  }
  if (templateId === 'work-hours-focus') {
    return createEmptyDailyRules().map(rule => ({
      ...rule,
      blockedTimeRanges: rule.dayOfWeek >= 1 && rule.dayOfWeek <= 5
        ? [{ startMinute: 540, endMinute: 1080 }]
        : [],
    }))
  }
  return createEmptyDailyRules()
}

/**
 * 指定テンプレートに対応するURLパターンを生成する。
 */
function createPatternsFromTemplate(templateId: GroupTemplateId): string[] {
  if (templateId === 'core-sns-15min') {
    return [
      'x.com',
      'twitter.com',
      'instagram.com',
      'facebook.com',
      'tiktok.com',
      'threads.net',
      'bsky.app',
    ]
  }
  if (templateId === 'video-30min') {
    return [
      'youtube.com',
      'youtu.be',
      'twitch.tv',
      'netflix.com',
      'primevideo.com',
      'abema.tv',
      'nicovideo.jp',
    ]
  }
  return []
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
    patterns: createPatternsFromTemplate(templateId),
    blockAction: DEFAULT_GLOBAL_SETTINGS.blockAction,
    redirectUrl: DEFAULT_GLOBAL_SETTINGS.redirectUrl,
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
