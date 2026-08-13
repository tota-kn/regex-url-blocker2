import type { GlobalSettings, Group, Rule, RuleKind, TimeWindow } from './types'

/** Wait を通過した後の既定アクセス許可期間（分）。 */
export const DEFAULT_WAIT_GRANT_MINUTES = 10

/** Wait の既定待機秒数。 */
export const DEFAULT_WAIT_SECONDS = 60

/** Daily limit の既定上限分数。 */
export const DEFAULT_DAILY_LIMIT_MINUTES = 30

/** 一時停止を開始するまでの既定待機時間（秒）。 */
export const DEFAULT_PAUSE_WAIT_SECONDS = 60

/** 一時停止の既定継続時間（分）。 */
export const DEFAULT_PAUSE_DURATION_MINUTES = 10

/** 遷移先に URL を選んだときの入力補助として使う既定 URL。 */
export const DEFAULT_REDIRECT_URL = 'https://example.com'

/**
 * 新規グループ作成時に選べるテンプレート識別子。
 */
export type GroupTemplateId = 'blank' | 'core-sns-15min' | 'video-30min' | 'work-hours-focus'

/**
 * 未設定時に使用するグローバル設定の既定値。
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  dailyResetHour: '03:00',
  remainingTimeNotificationsEnabled: true,
  notificationThresholdMinutes: 5,
}

/**
 * 指定 kind の既定ルールを作る。時間ウィンドウは常時、遷移先はブロックページ。
 */
export function createDefaultRule(kind: RuleKind): Rule {
  const base = { id: crypto.randomUUID(), window: { type: 'always' } as TimeWindow }
  if (kind === 'dailyLimit') {
    return {
      ...base,
      restriction: { kind, minutes: DEFAULT_DAILY_LIMIT_MINUTES },
      destination: { type: 'blockedPage' },
    }
  }
  if (kind === 'wait') {
    return {
      ...base,
      restriction: {
        kind,
        seconds: DEFAULT_WAIT_SECONDS,
        grantMinutes: DEFAULT_WAIT_GRANT_MINUTES,
      },
    }
  }
  return { ...base, restriction: { kind: 'block' }, destination: { type: 'blockedPage' } }
}

/**
 * 指定テンプレートに対応するルール配列を生成する。`blank` はルールなし（空配列）。
 */
function createRulesFromTemplate(templateId: GroupTemplateId): Rule[] {
  if (templateId === 'core-sns-15min') {
    return [
      { ...createDefaultRule('dailyLimit'), restriction: { kind: 'dailyLimit', minutes: 15 } },
    ]
  }
  if (templateId === 'video-30min') {
    return [
      { ...createDefaultRule('dailyLimit'), restriction: { kind: 'dailyLimit', minutes: 30 } },
    ]
  }
  if (templateId === 'work-hours-focus') {
    return [
      {
        ...createDefaultRule('block'),
        window: {
          type: 'scheduled',
          condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
          timeRanges: [{ startMinute: 540, endMinute: 1080 }],
        },
      },
    ]
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
    pauseWaitSeconds: DEFAULT_PAUSE_WAIT_SECONDS,
    pauseDurationMinutes: DEFAULT_PAUSE_DURATION_MINUTES,
    pauseAllowed: true,
    rules: createRulesFromTemplate(templateId),
  }
}
