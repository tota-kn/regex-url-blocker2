import type { GlobalSettings, Group, HHMM, Settings } from '../utils/types'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'

/** E2E 用の現行スキーマグループを生成する。 */
export function buildGroupFixture(overrides: Partial<Group> = {}): Group {
  return {
    id: 'fixture-group',
    name: 'Fixture group',
    disabled: false,
    lockMode: false,
    patterns: [],
    pauseWaitSeconds: 60,
    pauseDurationMinutes: 10,
    pauseAllowed: true,
    rules: [],
    ...overrides,
  }
}

/** E2E 用の現行スキーマ設定を生成する。 */
export function buildSettingsFixture(
  groups: Group[],
  global: Partial<GlobalSettings> = {},
): Settings {
  return { global: { ...DEFAULT_GLOBAL_SETTINGS, ...global }, groups }
}

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
  return buildSettingsFixture(
    [
      buildGroupFixture({
        id: 'effective-group',
        name: 'Effective group',
        disabled,
        lockMode,
        patterns: [`^${origin.replaceAll('.', '\\.')}`],
        pauseWaitSeconds: 60,
        pauseDurationMinutes: 10,
        pauseAllowed: true,
        ...buildRestrictionParts(dailyLimitMinutes, `${origin}/blocked`),
      }),
    ],
    { dailyResetHour },
  )
}
