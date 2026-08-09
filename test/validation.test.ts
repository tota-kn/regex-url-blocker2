import { describe, expect, it } from 'vitest'
import {
  isValidHHMM,
  VALIDATION_MESSAGES,
  validateGlobalSettings,
  validateGroup,
} from '../utils/validation'
import { isValidRegex, isValidUrlPattern } from '../utils/urlPatterns'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import type { RuleRestriction, ScheduleRuleCondition, TimeRange } from '../utils/types'
import { createEmptyGroup, weeklyRule } from './helpers'

/**
 * テスト用の単一ルール（条件・時間帯・制限内容の組）。
 */
interface RestrictionRule {
  /** 適用する日の条件。 */
  condition: ScheduleRuleCondition
  /** ルールが有効な時刻ウィンドウ。空配列は終日有効。 */
  timeRanges: TimeRange[]
  /** 制限内容。 */
  restriction: RuleRestriction
}

/**
 * テスト用の単一ルールを生成する。
 */
function restriction(overrides: Partial<RestrictionRule> = {}): RestrictionRule {
  return {
    condition: { type: 'daily' },
    timeRanges: [],
    restriction: { kind: 'dailyLimit', minutes: 30 },
    ...overrides,
  }
}

describe('isValidRegex', () => {
  it('正しい正規表現は true', () => {
    expect(isValidRegex('^https?://')).toBe(true)
    expect(isValidRegex('.*')).toBe(true)
  })

  it('構文エラーがある正規表現は false', () => {
    expect(isValidRegex('[invalid')).toBe(false)
    expect(isValidRegex('(unclosed')).toBe(false)
  })

  it('空文字は許容しない', () => {
    expect(isValidRegex('')).toBe(false)
  })
})

describe('isValidUrlPattern', () => {
  it('裸ドメインと正規表現を valid にする', () => {
    expect(isValidUrlPattern('example.com')).toBe(true)
    expect(isValidUrlPattern('sub.example.com')).toBe(true)
    expect(isValidUrlPattern('^https?://(www\\.)?twitter\\.com')).toBe(true)
    expect(isValidUrlPattern('example\\.com')).toBe(true)
  })

  it('裸ドメインとしても正規表現としても不正な値は invalid にする', () => {
    expect(isValidUrlPattern('')).toBe(false)
    expect(isValidUrlPattern('[invalid')).toBe(false)
  })
})

describe('isValidHHMM', () => {
  it('正常な時刻文字列は true', () => {
    expect(isValidHHMM('00:00')).toBe(true)
    expect(isValidHHMM('09:30')).toBe(true)
    expect(isValidHHMM('23:59')).toBe(true)
  })

  it('範囲外・形式不正は false', () => {
    expect(isValidHHMM('24:00')).toBe(false)
    expect(isValidHHMM('9:30')).toBe(false)
    expect(isValidHHMM('25:61')).toBe(false)
    expect(isValidHHMM('')).toBe(false)
    expect(isValidHHMM('abc')).toBe(false)
  })
})

describe('validateGroup', () => {
  it('正常なグループはエラーなし', () => {
    const g = {
      ...createEmptyGroup(),
      name: 'Twitter',
      patterns: ['^https?://(www\\.)?twitter\\.com'],
      ...weeklyRule(
        [3],
        { kind: 'block' },
        { timeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }] },
      ),
    }
    expect(validateGroup(g)).toEqual([])
  })

  it('空 name・無効 pattern でそれぞれエラー', () => {
    const errors = validateGroup({
      id: 'x',
      name: '   ',
      mode: 'blacklist',
      disabled: false,
      lockMode: false,
      patterns: ['['],
      rules: [],
      pauseAllowed: true,
    })
    expect(errors.some((e) => e.field === 'name')).toBe(true)
    expect(
      errors.some((e) => e.field === 'patterns[0]' && e.message === VALIDATION_MESSAGES.urlPattern),
    ).toBe(true)
  })

  it('URL pattern と Rule が未設定ならそれぞれエラー', () => {
    const g = { ...createEmptyGroup(), name: 'X' }
    const errors = validateGroup(g, { requireConfiguredSections: true })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: 'patterns', message: VALIDATION_MESSAGES.patterns },
        { field: 'rules', message: VALIDATION_MESSAGES.rules },
      ]),
    )
  })

  it('mode が whitelist も valid', () => {
    const g = { ...createEmptyGroup(), name: 'X', mode: 'whitelist' as const }
    expect(validateGroup(g)).toEqual([])
  })

  it('mode が不正値だとエラー', () => {
    const g = { ...createEmptyGroup(), name: 'X', mode: 'invalid' as 'blacklist' }
    expect(validateGroup(g).some((e) => e.field === 'mode')).toBe(true)
  })
})

describe('validateRestriction (validateGroup 経由)', () => {
  /** 指定ルールを持つグループを検証する。 */
  function validateRestrictionRule(r: RestrictionRule): ReturnType<typeof validateGroup> {
    return validateGroup({
      ...createEmptyGroup(),
      name: 'X',
      rules: [
        {
          id: 'r0',
          window: { type: 'scheduled', condition: r.condition, timeRanges: r.timeRanges },
          restriction: r.restriction,
          ...(r.restriction.kind === 'wait'
            ? {}
            : { destination: { type: 'blockedPage' as const } }),
        },
      ],
    })
  }

  it('日跨ぎのブロック時間帯は valid', () => {
    expect(
      validateRestrictionRule(
        restriction({
          restriction: { kind: 'block' },
          timeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }],
        }),
      ),
    ).toEqual([])
  })

  it('24:00 相当の 1440 は valid', () => {
    expect(
      validateRestrictionRule(
        restriction({
          restriction: { kind: 'block' },
          timeRanges: [{ startMinute: 0, endMinute: 1440 }],
        }),
      ),
    ).toEqual([])
  })

  it('startMinute / endMinute が範囲外だとエラー', () => {
    const startErrors = validateRestrictionRule(
      restriction({
        restriction: { kind: 'block' },
        timeRanges: [{ startMinute: -1, endMinute: 360 }],
      }),
    )
    expect(startErrors.some((e) => e.field === 'rules[0].window.timeRanges[0].startMinute')).toBe(
      true,
    )

    const endErrors = validateRestrictionRule(
      restriction({
        restriction: { kind: 'block' },
        timeRanges: [{ startMinute: 1320, endMinute: 1441 }],
      }),
    )
    expect(endErrors.some((e) => e.field === 'rules[0].window.timeRanges[0].endMinute')).toBe(true)
  })

  it('weekly の曜日が空・範囲外・重複だとエラー', () => {
    expect(
      validateRestrictionRule(restriction({ condition: { type: 'weekly', daysOfWeek: [] } })).some(
        (e) => e.field === 'rules[0].window.condition.daysOfWeek',
      ),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ condition: { type: 'weekly', daysOfWeek: [7 as 0] } }),
      ).some((e) => e.field === 'rules[0].window.condition.daysOfWeek'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ condition: { type: 'weekly', daysOfWeek: [1, 1] } }),
      ).some((e) => e.field === 'rules[0].window.condition.daysOfWeek'),
    ).toBe(true)
    expect(
      validateRestrictionRule(restriction({ condition: { type: 'weekly', daysOfWeek: [0, 6] } })),
    ).toEqual([])
  })

  it('monthly の日付が空・0・32・重複だとエラー', () => {
    expect(
      validateRestrictionRule(
        restriction({ condition: { type: 'monthly', daysOfMonth: [] } }),
      ).some((e) => e.field === 'rules[0].window.condition.daysOfMonth'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ condition: { type: 'monthly', daysOfMonth: [0] } }),
      ).some((e) => e.field === 'rules[0].window.condition.daysOfMonth'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ condition: { type: 'monthly', daysOfMonth: [32] } }),
      ).some((e) => e.field === 'rules[0].window.condition.daysOfMonth'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ condition: { type: 'monthly', daysOfMonth: [1, 1] } }),
      ).some((e) => e.field === 'rules[0].window.condition.daysOfMonth'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ condition: { type: 'monthly', daysOfMonth: [1, 15, 31] } }),
      ),
    ).toEqual([])
  })

  it('period は 2/29 を許容し 2/30 や 13月を拒否する', () => {
    expect(
      validateRestrictionRule(
        restriction({
          condition: { type: 'period', start: { month: 2, day: 29 }, end: { month: 2, day: 29 } },
        }),
      ),
    ).toEqual([])
    expect(
      validateRestrictionRule(
        restriction({
          condition: { type: 'period', start: { month: 2, day: 30 }, end: { month: 3, day: 1 } },
        }),
      ).some((e) => e.field === 'rules[0].window.condition.start'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({
          condition: { type: 'period', start: { month: 12, day: 28 }, end: { month: 13, day: 1 } },
        }),
      ).some((e) => e.field === 'rules[0].window.condition.end'),
    ).toBe(true)
  })

  it('年跨ぎの period は valid', () => {
    expect(
      validateRestrictionRule(
        restriction({
          condition: { type: 'period', start: { month: 12, day: 28 }, end: { month: 1, day: 3 } },
        }),
      ),
    ).toEqual([])
  })

  it('grace は graceMinutes が 0以上の整数でないとエラー', () => {
    expect(
      validateRestrictionRule(restriction({ restriction: { kind: 'dailyLimit', minutes: 0 } })),
    ).toEqual([])
    expect(
      validateRestrictionRule(
        restriction({
          restriction: { kind: 'dailyLimit', minutes: undefined as unknown as number },
        }),
      ).some((e) => e.field === 'rules[0].restriction.minutes'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ restriction: { kind: 'dailyLimit', minutes: -1 } }),
      ).some((e) => e.field === 'rules[0].restriction.minutes'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ restriction: { kind: 'dailyLimit', minutes: 1.5 } }),
      ).some((e) => e.field === 'rules[0].restriction.minutes'),
    ).toBe(true)
  })

  it('block は他の値が未指定でも valid', () => {
    expect(
      validateRestrictionRule(restriction({ restriction: { kind: 'block' }, timeRanges: [] })),
    ).toEqual([])
  })

  it('wait は待機秒数が0以上、許可期間が1以上の整数でないとエラー', () => {
    expect(
      validateRestrictionRule(
        restriction({ restriction: { kind: 'wait', seconds: 0, grantMinutes: 1 } }),
      ),
    ).toEqual([])
    expect(
      validateRestrictionRule(
        restriction({
          restriction: { kind: 'wait', seconds: undefined as unknown as number, grantMinutes: 10 },
        }),
      ).some((e) => e.field === 'rules[0].restriction.seconds'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ restriction: { kind: 'wait', seconds: 1, grantMinutes: 0 } }),
      ).some((e) => e.field === 'rules[0].restriction.grantMinutes'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({
          restriction: { kind: 'wait', seconds: 1, grantMinutes: undefined as unknown as number },
        }),
      ).some((e) => e.field === 'rules[0].restriction.grantMinutes'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ restriction: { kind: 'wait', seconds: 1, grantMinutes: -1 } }),
      ).some((e) => e.field === 'rules[0].restriction.grantMinutes'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ restriction: { kind: 'wait', seconds: 1, grantMinutes: 1.5 } }),
      ).some((e) => e.field === 'rules[0].restriction.grantMinutes'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ restriction: { kind: 'wait', seconds: -1, grantMinutes: 10 } }),
      ).some((e) => e.field === 'rules[0].restriction.seconds'),
    ).toBe(true)
    expect(
      validateRestrictionRule(
        restriction({ restriction: { kind: 'wait', seconds: 1.5, grantMinutes: 10 } }),
      ).some((e) => e.field === 'rules[0].restriction.seconds'),
    ).toBe(true)
  })
})

describe('validateGlobalSettings', () => {
  it('正常な設定はエラーなし', () => {
    expect(
      validateGlobalSettings({
        ...DEFAULT_GLOBAL_SETTINGS,
        dailyResetHour: '00:00',
      }),
    ).toEqual([])
  })

  it('不正な HH:MM はエラー', () => {
    const errors = validateGlobalSettings({
      ...DEFAULT_GLOBAL_SETTINGS,
      dailyResetHour: '99:99',
    })
    expect(errors.some((e) => e.field === 'dailyResetHour')).toBe(true)
  })

  it('notificationThresholdMinutes は 1 以上の整数を許可する', () => {
    expect(
      validateGlobalSettings({
        ...DEFAULT_GLOBAL_SETTINGS,
        notificationThresholdMinutes: 10,
      }),
    ).toEqual([])
  })

  it('notificationThresholdMinutes が 0、負数、または小数だとエラー', () => {
    expect(
      validateGlobalSettings({
        ...DEFAULT_GLOBAL_SETTINGS,
        notificationThresholdMinutes: 0,
      }).some((e) => e.field === 'notificationThresholdMinutes'),
    ).toBe(true)
    expect(
      validateGlobalSettings({
        ...DEFAULT_GLOBAL_SETTINGS,
        notificationThresholdMinutes: -1,
      }).some((e) => e.field === 'notificationThresholdMinutes'),
    ).toBe(true)
    expect(
      validateGlobalSettings({
        ...DEFAULT_GLOBAL_SETTINGS,
        notificationThresholdMinutes: 1.5,
      }).some((e) => e.field === 'notificationThresholdMinutes'),
    ).toBe(true)
  })

  it('Pause の待機秒数は 0 以上、継続時間は 1 分以上の整数を許可する', () => {
    expect(
      validateGroup({ ...createEmptyGroup('Pause'), pauseWaitSeconds: 0, pauseDurationMinutes: 1 }),
    ).toEqual([])
  })

  it('Pause の不正な待機秒数と継続時間を拒否する', () => {
    expect(
      validateGroup({ ...createEmptyGroup('Pause'), pauseWaitSeconds: -1 }).some(
        (error) => error.field === 'pauseWaitSeconds',
      ),
    ).toBe(true)
    expect(
      validateGroup({ ...createEmptyGroup('Pause'), pauseDurationMinutes: 0 }).some(
        (error) => error.field === 'pauseDurationMinutes',
      ),
    ).toBe(true)
  })

  it('通知ON/OFF設定が boolean でないとエラー', () => {
    expect(
      validateGlobalSettings({
        ...DEFAULT_GLOBAL_SETTINGS,
        remainingTimeNotificationsEnabled: 'yes' as unknown as boolean,
      }).some((e) => e.field === 'remainingTimeNotificationsEnabled'),
    ).toBe(true)
  })
})
