import type { GlobalSettings, Group, RestrictionRule, RestrictionType } from './types'

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
 * 指定 type の既定 `RestrictionRule` を作る。
 * `base` を渡すと `condition`/`timeRanges` を引き継いだまま type だけ切り替える（制限種別の切替 UI で使用）。
 */
export function createDefaultRestriction(type: RestrictionType, base?: Pick<RestrictionRule, 'condition' | 'timeRanges'>): RestrictionRule {
  return {
    condition: base?.condition ?? { type: 'daily' },
    timeRanges: base?.timeRanges ?? [],
    type,
  }
}

/**
 * 指定テンプレートに対応する制限ルール配列を生成する。`blank` は制限なし（空配列）。
 */
function createRestrictionRulesFromTemplate(templateId: GroupTemplateId): RestrictionRule[] {
  if (templateId === 'core-sns-15min') {
    return [{ condition: { type: 'daily' }, timeRanges: [], type: 'grace', graceMinutes: 15 }]
  }
  if (templateId === 'video-30min') {
    return [{ condition: { type: 'daily' }, timeRanges: [], type: 'grace', graceMinutes: 30 }]
  }
  if (templateId === 'work-hours-focus') {
    return [{
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      timeRanges: [{ startMinute: 540, endMinute: 1080 }],
      type: 'block',
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
    restrictionRules: createRestrictionRulesFromTemplate(templateId),
  }
}
