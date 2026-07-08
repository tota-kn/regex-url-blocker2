import type { GlobalSettings, Group, ScheduleRule } from './types'

/**
 * 新規グループ作成時に選べるテンプレート識別子。
 */
export type GroupTemplateId = 'blank' | 'core-sns-15min' | 'video-30min' | 'work-hours-focus'

/**
 * 未設定時に使用するグローバル設定の既定値。docs/spec/domain.md 準拠。
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
 * 空のスケジュールルールを1件生成する。UI の「ルール追加」の初期値。
 */
export function createEmptyScheduleRule(): ScheduleRule {
  return {
    id: crypto.randomUUID(),
    condition: { type: 'daily' },
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
  }
}

/**
 * 指定テンプレートに対応するスケジュールルールを生成する。
 */
function createScheduleRulesFromTemplate(templateId: GroupTemplateId): ScheduleRule[] {
  if (templateId === 'core-sns-15min') {
    return [{ ...createEmptyScheduleRule(), dailyLimitMinutes: 15 }]
  }
  if (templateId === 'video-30min') {
    return [{ ...createEmptyScheduleRule(), dailyLimitMinutes: 30 }]
  }
  if (templateId === 'work-hours-focus') {
    return [{
      ...createEmptyScheduleRule(),
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      blockedTimeRanges: [{ startMinute: 540, endMinute: 1080 }],
    }]
  }
  return []
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
    disabled: false,
    lockMode: false,
    patterns: createPatternsFromTemplate(templateId),
    blockAction: DEFAULT_GLOBAL_SETTINGS.blockAction,
    redirectUrl: DEFAULT_GLOBAL_SETTINGS.redirectUrl,
    scheduleRules: createScheduleRulesFromTemplate(templateId),
  }
}
