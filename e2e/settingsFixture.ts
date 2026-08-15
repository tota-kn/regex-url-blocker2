import type { Group, HHMM, Settings } from '../utils/types'

/** 毎日同じ上限分数を使うテスト用ルールを作る。undefined はルールなし。 */
function buildRestrictionParts(
  dailyLimitMinutes: number | undefined,
  redirectUrl: string,
): Pick<Group, 'rules'> {
  if (dailyLimitMinutes === undefined) return { rules: [] }
  return {
    rules: [
      {
        id: 'effective-rule',
        window: { type: 'always' },
        restriction: { kind: 'dailyLimit', minutes: dailyLimitMinutes },
        destination: { type: 'redirect', url: redirectUrl },
      },
    ],
  }
}

/** background E2E 用の現行スキーマ設定を生成する。 */
export function buildEffectiveSettingsFixture(
  origin: string,
  dailyResetHour: HHMM,
  dailyLimitMinutes: number | undefined,
  lockMode = false,
  disabled = false,
): Settings {
  return {
    global: {
      dailyResetHour,
      remainingTimeNotificationsEnabled: true,
      notificationThresholdMinutes: 5,
    },
    groups: [
      {
        id: 'effective-group',
        name: 'Effective group',
        mode: 'blacklist',
        disabled,
        lockMode,
        patterns: [`^${origin.replaceAll('.', '\\.')}`],
        pauseWaitSeconds: 60,
        pauseDurationMinutes: 10,
        pauseAllowed: true,
        ...buildRestrictionParts(dailyLimitMinutes, `${origin}/blocked`),
      },
    ],
  }
}
