import { describe, expect, it } from 'vitest'
import {
  applyGroupPauseState,
  evaluateUrl,
  formatRemainingMinutesBadge,
  getActiveBlockedTimeRanges,
  getBlockedTimeRangeReleaseAt,
  getGroupBlockStatus,
  getLogicalDate,
  getMinimumRemainingTimeLimit,
  getNextDailyResetAt,
  getRestrictionsForNow,
  getTargetGroupIds,
  getTimeLimitUsageSummary,
  getTimeRangeUnblockAt,
  incrementCounters,
  matchesScheduleRuleCondition,
  normalizeCounters,
  resolveEffectiveRestrictions,
  shouldSkipUrl,
} from '../utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import type { Group, ScheduleRule, Settings, UsageCountersState } from '../utils/types'
import { dailyScheduleRules, weeklyScheduleRules } from './helpers'

/**
 * テスト用のグループを生成する。
 */
function group(overrides: Partial<Group>): Group {
  return {
    id: 'g1',
    name: 'Group',
    mode: 'blacklist',
    disabled: false,
    lockMode: false,
    patterns: ['example\\.com'],
    blockAction: DEFAULT_GLOBAL_SETTINGS.blockAction,
    redirectUrl: DEFAULT_GLOBAL_SETTINGS.redirectUrl,
    scheduleRules: [],
    ...overrides,
  }
}

/**
 * テスト用のスケジュールルールを生成する。
 */
function rule(overrides: Partial<ScheduleRule>): ScheduleRule {
  return {
    id: 'rule',
    condition: { type: 'daily' },
    blockedTimeRanges: [],
    dailyLimitMinutes: undefined,
    ...overrides,
  }
}

/**
 * テスト用の設定を生成する。
 */
function settings(groups: Group[], dailyResetHour = '00:00'): Settings {
  return {
    global: {
      ...DEFAULT_GLOBAL_SETTINGS,
      blockAction: 'redirect',
      redirectUrl: 'https://redirect.test/',
      dailyResetHour,
    },
    groups,
  }
}

/**
 * 空のカウンタ状態を返す。
 */
function emptyCounters(): UsageCountersState {
  return { counters: {} }
}

describe('URL target matching', () => {
  it('blacklist は正規表現に部分一致した URL を対象にする', () => {
    const s = settings([group({ id: 'black' })])
    expect(getTargetGroupIds(s, 'https://www.example.com/path')).toEqual(['black'])
    expect(getTargetGroupIds(s, 'https://other.test/')).toEqual([])
  })

  it('裸ドメインは本体ドメインとサブドメインの全ページを対象にする', () => {
    const s = settings([group({ id: 'domain', patterns: ['example.com'] })])
    expect(getTargetGroupIds(s, 'https://example.com/')).toEqual(['domain'])
    expect(getTargetGroupIds(s, 'https://www.example.com/path?q=1')).toEqual(['domain'])
    expect(getTargetGroupIds(s, 'https://deep.news.example.com/articles/1')).toEqual(['domain'])
  })

  it('裸ドメインは似た別ドメインを対象にしない', () => {
    const s = settings([group({ id: 'domain', patterns: ['example.com'] })])
    expect(getTargetGroupIds(s, 'https://notexample.com/')).toEqual([])
    expect(getTargetGroupIds(s, 'https://example.com.evil.test/')).toEqual([])
  })

  it('既存の正規表現形式は引き続き正規表現として扱う', () => {
    const s = settings([
      group({ id: 'scheme-regex', patterns: ['^https?://(www\\.)?twitter\\.com'] }),
      group({ id: 'escaped-regex', patterns: ['example\\.com'] }),
    ])
    expect(getTargetGroupIds(s, 'https://twitter.com/home')).toEqual(['scheme-regex'])
    expect(getTargetGroupIds(s, 'https://www.example.com/')).toEqual(['escaped-regex'])
  })

  it('whitelist は正規表現に一致しない URL を対象にする', () => {
    const s = settings([group({ id: 'white', mode: 'whitelist' })])
    expect(getTargetGroupIds(s, 'https://www.example.com/path')).toEqual([])
    expect(getTargetGroupIds(s, 'https://other.test/')).toEqual(['white'])
  })

  it('無効な正規表現は例外にせず無視する', () => {
    const s = settings([group({ id: 'bad', patterns: ['['] })])
    expect(getTargetGroupIds(s, 'https://example.com/')).toEqual([])
  })

  it('skip URL と redirect URL は常に判定対象外にする', () => {
    expect(shouldSkipUrl('chrome://settings', 'https://redirect.test/')).toBe(true)
    expect(shouldSkipUrl('chrome-extension://id/options.html', 'https://redirect.test/')).toBe(true)
    expect(shouldSkipUrl('about:blank', 'https://redirect.test/')).toBe(true)
    expect(shouldSkipUrl('file:///tmp/a.html', 'https://redirect.test/')).toBe(true)
    expect(shouldSkipUrl('https://redirect.test/', 'https://redirect.test/')).toBe(true)
  })

  it('グループ別 redirect URL は判定対象外にする', () => {
    const s = settings([group({ blockAction: 'redirect', redirectUrl: 'https://redirect.test/' })])

    expect(getTargetGroupIds(s, 'https://redirect.test/')).toEqual([])
  })

  it('disabled group は URL 判定と redirect URL skip 判定から除外する', () => {
    const s = settings([group({
      id: 'disabled',
      disabled: true,
      blockAction: 'redirect',
      redirectUrl: 'https://disabled-redirect.test/',
    })])

    expect(getTargetGroupIds(s, 'https://example.com/')).toEqual([])
    expect(getTargetGroupIds(s, 'https://disabled-redirect.test/')).toEqual([])
  })
})

describe('logical date', () => {
  it('リセット時刻前は前日を論理日にし、曜日・月日も論理日開始時点で判定する', () => {
    const info = getLogicalDate(new Date('2026-05-06T02:59:00+09:00'), '03:00')
    expect(info.logicalDate).toBe('2026-05-05')
    expect(info.dayOfWeek).toBe(2)
    expect(info.month).toBe(5)
    expect(info.dayOfMonth).toBe(5)
  })
})

describe('schedule rule conditions', () => {
  it('daily 条件は常に一致する', () => {
    const info = getLogicalDate(new Date('2026-05-06T12:00:00+09:00'), '00:00')
    expect(matchesScheduleRuleCondition({ type: 'daily' }, info)).toBe(true)
  })

  it('weekly 条件は指定曜日だけに一致する', () => {
    const wednesday = getLogicalDate(new Date('2026-05-06T12:00:00+09:00'), '00:00')
    const thursday = getLogicalDate(new Date('2026-05-07T12:00:00+09:00'), '00:00')
    expect(matchesScheduleRuleCondition({ type: 'weekly', daysOfWeek: [3] }, wednesday)).toBe(true)
    expect(matchesScheduleRuleCondition({ type: 'weekly', daysOfWeek: [3] }, thursday)).toBe(false)
  })

  it('monthly 条件は毎月の指定日に一致し、31日は日数の少ない月では一致しない', () => {
    const may31 = getLogicalDate(new Date('2026-05-31T12:00:00+09:00'), '00:00')
    const apr30 = getLogicalDate(new Date('2026-04-30T12:00:00+09:00'), '00:00')
    expect(matchesScheduleRuleCondition({ type: 'monthly', daysOfMonth: [1, 31] }, may31)).toBe(true)
    expect(matchesScheduleRuleCondition({ type: 'monthly', daysOfMonth: [31] }, apr30)).toBe(false)
  })

  it('period 条件は両端を含み、年跨ぎ期間にも一致する', () => {
    const condition = { type: 'period', start: { month: 12, day: 28 }, end: { month: 1, day: 3 } } as const
    expect(matchesScheduleRuleCondition(condition, getLogicalDate(new Date('2026-12-28T12:00:00+09:00'), '00:00'))).toBe(true)
    expect(matchesScheduleRuleCondition(condition, getLogicalDate(new Date('2027-01-03T12:00:00+09:00'), '00:00'))).toBe(true)
    expect(matchesScheduleRuleCondition(condition, getLogicalDate(new Date('2026-05-06T12:00:00+09:00'), '00:00'))).toBe(false)
  })

  it('period 条件は start === end で単日に一致する', () => {
    const condition = { type: 'period', start: { month: 5, day: 6 }, end: { month: 5, day: 6 } } as const
    expect(matchesScheduleRuleCondition(condition, getLogicalDate(new Date('2026-05-06T12:00:00+09:00'), '00:00'))).toBe(true)
    expect(matchesScheduleRuleCondition(condition, getLogicalDate(new Date('2026-05-07T12:00:00+09:00'), '00:00'))).toBe(false)
  })

  it('period 条件の 2/29 は閏年だけ一致する', () => {
    const condition = { type: 'period', start: { month: 2, day: 29 }, end: { month: 2, day: 29 } } as const
    expect(matchesScheduleRuleCondition(condition, getLogicalDate(new Date('2028-02-29T12:00:00+09:00'), '00:00'))).toBe(true)
    expect(matchesScheduleRuleCondition(condition, getLogicalDate(new Date('2026-02-28T12:00:00+09:00'), '00:00'))).toBe(false)
  })

  it('条件マッチは論理日基準で判定する（リセット前は前日の日付扱い）', () => {
    const s = settings([group({
      scheduleRules: [rule({ condition: { type: 'monthly', daysOfMonth: [1] }, blockedTimeRanges: [{ startMinute: 0, endMinute: 0 }] })],
    })], '03:00')
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-01-02T01:00:00+09:00')).blocked).toBe(true)
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-01-02T04:00:00+09:00')).blocked).toBe(false)
  })
})

describe('effective restrictions merge', () => {
  it('マッチした全ルールを合成し、時間帯は和集合・上限は最小値にする', () => {
    const g = group({
      scheduleRules: [
        rule({ id: 'r1', condition: { type: 'weekly', daysOfWeek: [3] }, blockedTimeRanges: [{ startMinute: 540, endMinute: 1080 }], dailyLimitMinutes: 60 }),
        rule({ id: 'r2', blockedTimeRanges: [{ startMinute: 1320, endMinute: 360 }], dailyLimitMinutes: 30 }),
      ],
    })
    const wednesday = getLogicalDate(new Date('2026-05-06T12:00:00+09:00'), '00:00')
    const thursday = getLogicalDate(new Date('2026-05-07T12:00:00+09:00'), '00:00')

    expect(resolveEffectiveRestrictions(g, wednesday)).toEqual({
      blockedTimeRanges: [{ startMinute: 540, endMinute: 1080 }, { startMinute: 1320, endMinute: 360 }],
      dailyLimitMinutes: 30,
    })
    expect(resolveEffectiveRestrictions(g, thursday)).toEqual({
      blockedTimeRanges: [{ startMinute: 1320, endMinute: 360 }],
      dailyLimitMinutes: 30,
    })
  })

  it('マッチするルールがなければ制限なしにする', () => {
    const g = group({ scheduleRules: weeklyScheduleRules([0], { dailyLimitMinutes: 10 }) })
    const wednesday = getLogicalDate(new Date('2026-05-06T12:00:00+09:00'), '00:00')
    expect(resolveEffectiveRestrictions(g, wednesday)).toEqual({
      blockedTimeRanges: [],
      dailyLimitMinutes: undefined,
    })
  })

  it('時間帯ブロックと上限は同じ日に併用できる', () => {
    const s = settings([group({
      scheduleRules: [
        rule({ id: 'block', condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] }, blockedTimeRanges: [{ startMinute: 540, endMinute: 1080 }] }),
        rule({ id: 'limit', dailyLimitMinutes: 1 }),
      ],
    })])
    const counters = { counters: { g1: { logicalDate: '2026-05-06', consumedSec: 60 } } }

    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T10:00:00+09:00')).blocked).toBe(true)
    expect(evaluateUrl(s, counters, 'https://example.com/', new Date('2026-05-06T20:00:00+09:00')).blocked).toBe(true)
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T20:00:00+09:00')).blocked).toBe(false)
  })
})

describe('block release time', () => {
  it('通常時間帯ブロックの解除時刻を返す', () => {
    const releaseAt = getBlockedTimeRangeReleaseAt(
      { startMinute: 9 * 60, endMinute: 17 * 60 },
      new Date('2026-05-06T10:30:00+09:00'),
    )

    expect(releaseAt.toISOString()).toBe('2026-05-06T08:00:00.000Z')
  })

  it('日跨ぎ時間帯ブロックの翌日側解除時刻を返す', () => {
    const releaseAt = getBlockedTimeRangeReleaseAt(
      { startMinute: 22 * 60, endMinute: 6 * 60 },
      new Date('2026-05-06T23:30:00+09:00'),
    )

    expect(releaseAt.toISOString()).toBe('2026-05-06T21:00:00.000Z')
  })

  it('日跨ぎ時間帯ブロックの当日側解除時刻を返す', () => {
    const releaseAt = getBlockedTimeRangeReleaseAt(
      { startMinute: 22 * 60, endMinute: 6 * 60 },
      new Date('2026-05-06T05:30:00+09:00'),
    )

    expect(releaseAt.toISOString()).toBe('2026-05-05T21:00:00.000Z')
  })

  it('start と end が同じ24時間ブロックの次の同時刻を返す', () => {
    const releaseAt = getBlockedTimeRangeReleaseAt(
      { startMinute: 9 * 60, endMinute: 9 * 60 },
      new Date('2026-05-06T10:30:00+09:00'),
    )

    expect(releaseAt.toISOString()).toBe('2026-05-07T00:00:00.000Z')
  })

  it('daily limit 到達時の次回 daily reset 時刻を返す', () => {
    const releaseAt = getNextDailyResetAt(
      new Date('2026-05-06T12:00:00+09:00'),
      settings([], '03:00').global,
    )

    expect(releaseAt.toISOString()).toBe('2026-05-06T18:00:00.000Z')
  })
})

describe('time range unblock walk', () => {
  it('同一論理日内で解除される場合は時間帯の終了時刻を返す', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ blockedTimeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }] }),
    })])
    const unblockAt = getTimeRangeUnblockAt(s.groups[0], new Date('2026-05-06T10:30:00+09:00'), s.global)

    expect(unblockAt?.toISOString()).toBe('2026-05-06T08:00:00.000Z')
  })

  it('当日限りの日跨ぎ時間帯は翌論理日の reset 時刻で解除される', () => {
    const s = settings([group({
      scheduleRules: weeklyScheduleRules([3], { blockedTimeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }] }),
    })], '03:00')
    const unblockAt = getTimeRangeUnblockAt(s.groups[0], new Date('2026-05-06T23:30:00+09:00'), s.global)

    expect(unblockAt?.toISOString()).toBe('2026-05-06T18:00:00.000Z')
  })

  it('翌論理日に別ルールの時間帯が続く場合はその終了時刻まで進める', () => {
    const s = settings([group({
      scheduleRules: [
        rule({ id: 'wed', condition: { type: 'weekly', daysOfWeek: [3] }, blockedTimeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }] }),
        rule({ id: 'thu', condition: { type: 'weekly', daysOfWeek: [4] }, blockedTimeRanges: [{ startMinute: 0, endMinute: 7 * 60 }] }),
      ],
    })], '03:00')
    const unblockAt = getTimeRangeUnblockAt(s.groups[0], new Date('2026-05-06T23:30:00+09:00'), s.global)

    expect(unblockAt?.toISOString()).toBe('2026-05-06T22:00:00.000Z')
  })

  it('毎日終日ブロックでは解除時刻を返さない', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ blockedTimeRanges: [{ startMinute: 0, endMinute: 0 }] }),
    })])
    expect(getTimeRangeUnblockAt(s.groups[0], new Date('2026-05-06T10:30:00+09:00'), s.global)).toBeUndefined()
  })
})

describe('blocking evaluation', () => {
  it('通常時間帯のブロックを判定する', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ blockedTimeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }] }),
    })])
    const result = evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T10:00:00+09:00'))
    expect(result.blocked).toBe(true)
    expect(result.blockedGroupIds).toEqual(['g1'])
  })

  it('disabled group はブロック判定から除外する', () => {
    const s = settings([group({
      disabled: true,
      scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 0 }),
    })])
    const result = evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'))

    expect(result).toEqual({
      blocked: false,
      targetGroupIds: [],
      blockedGroupIds: [],
    })
  })

  it('日跨ぎ時間帯のブロックを判定する', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ blockedTimeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }] }),
    })])
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T23:00:00+09:00')).blocked).toBe(true)
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T05:59:00+09:00')).blocked).toBe(true)
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00')).blocked).toBe(false)
  })

  it('start と end が同じ時間帯は 24 時間ブロックにする', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ blockedTimeRanges: [{ startMinute: 0, endMinute: 0 }] }),
    })])
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00')).blocked).toBe(true)
  })

  it('曜日指定は論理日開始時点の曜日で判定する', () => {
    const s = settings([group({
      scheduleRules: weeklyScheduleRules([2], { blockedTimeRanges: [{ startMinute: 0, endMinute: 1440 }] }),
    })], '03:00')
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T02:00:00+09:00')).blocked).toBe(true)
  })

  it('0 分上限は即ブロックにする', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 0 }),
    })])
    const result = evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'))
    expect(result.blocked).toBe(true)
  })

  it('https?://x.com.* と 0 分上限で x.com をブロックする', () => {
    const s = settings([group({
      patterns: ['https?://x.com.*'],
      scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 0 }),
    })])
    const result = evaluateUrl(s, emptyCounters(), 'https://x.com/', new Date('2026-05-06T12:00:00+09:00'))
    expect(result.blocked).toBe(true)
  })

  it('上限秒数以上のカウンタでブロックする', () => {
    const s = settings([group({ scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 1 }) })])
    const counters = { counters: { g1: { logicalDate: '2026-05-06', consumedSec: 60 } } }
    expect(evaluateUrl(s, counters, 'https://example.com/', new Date('2026-05-06T12:00:00+09:00')).blocked).toBe(true)
  })

  it('一時停止中 group id のブロックだけを除外する', () => {
    const s = settings([
      group({ id: 'paused', patterns: ['example'], scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 0 }) }),
      group({ id: 'active', patterns: ['example'], scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 0 }) }),
    ])
    const evaluation = evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'))

    const result = applyGroupPauseState(evaluation, {
      groupPauseState: {
        paused: { pausedUntil: 1_000 },
      },
    }, 999)

    expect(result.blocked).toBe(true)
    expect(result.targetGroupIds).toEqual(['paused', 'active'])
    expect(result.blockedGroupIds).toEqual(['active'])
  })

  it('一時停止中 group だけがブロック理由ならブロックしない', () => {
    const s = settings([group({ id: 'paused', scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 0 }) })])
    const evaluation = evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'))

    const result = applyGroupPauseState(evaluation, {
      groupPauseState: {
        paused: { pausedUntil: 1_000 },
      },
    }, 999)

    expect(result.blocked).toBe(false)
    expect(result.targetGroupIds).toEqual(['paused'])
    expect(result.blockedGroupIds).toEqual([])
  })

  it('popup 用 status は時間帯ブロック中の状態を返す', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ blockedTimeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }] }),
    })])
    const now = new Date('2026-05-06T10:00:00+09:00')
    const status = getGroupBlockStatus(s.groups[0], undefined, now, s.global)

    expect(getActiveBlockedTimeRanges(s.groups[0], now, s.global)).toEqual([{ startMinute: 540, endMinute: 1020 }])
    expect(status.blockedByTimeRange).toBe(true)
    expect(status.blocked).toBe(true)
  })

  it('popup 用 status は daily limit 到達中の状態を返す', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 1 }),
    })])
    const status = getGroupBlockStatus(
      s.groups[0],
      { logicalDate: '2026-05-06', consumedSec: 60 },
      new Date('2026-05-06T12:00:00+09:00'),
      s.global,
    )

    expect(status.blockedByDailyLimit).toBe(true)
    expect(status.timeLimitSummary?.remainingSec).toBe(0)
    expect(status.blocked).toBe(true)
  })

  it('popup 用 status は disabled group を対象外にする', () => {
    const s = settings([group({
      disabled: true,
      scheduleRules: dailyScheduleRules({
        blockedTimeRanges: [{ startMinute: 0, endMinute: 0 }],
        dailyLimitMinutes: 0,
      }),
    })])
    const status = getGroupBlockStatus(s.groups[0], undefined, new Date('2026-05-06T12:00:00+09:00'), s.global)

    expect(getRestrictionsForNow(s.groups[0], new Date('2026-05-06T12:00:00+09:00'), s.global)).toBeUndefined()
    expect(status).toEqual({
      restrictions: undefined,
      activeBlockedTimeRanges: [],
      timeLimitSummary: undefined,
      blockedByTimeRange: false,
      blockedByDailyLimit: false,
      blocked: false,
    })
  })
})

describe('counters', () => {
  it('今日にマッチする上限から残り秒数を算出する', () => {
    const s = settings([group({
      scheduleRules: weeklyScheduleRules([3], { dailyLimitMinutes: 30 }),
    })])
    const summary = getTimeLimitUsageSummary(
      s.groups[0],
      { logicalDate: '2026-05-06', consumedSec: 75 },
      new Date('2026-05-06T12:00:00+09:00'),
      s.global,
    )
    expect(summary).toEqual({
      logicalDate: '2026-05-06',
      limitMinutes: 30,
      consumedSec: 75,
      remainingSec: 1725,
    })
  })

  it('曜日別上限の残り時間を返す', () => {
    const s = settings([group({
      scheduleRules: weeklyScheduleRules([3], { dailyLimitMinutes: 20 }),
    })])
    const summary = getTimeLimitUsageSummary(
      s.groups[0],
      { logicalDate: '2026-05-06', consumedSec: 300 },
      new Date('2026-05-06T12:00:00+09:00'),
      s.global,
    )
    expect(summary?.limitMinutes).toBe(20)
    expect(summary?.remainingSec).toBe(900)
  })

  it('残り時間算出では論理日が違う counter を 0 秒消費として扱う', () => {
    const s = settings([group({
      scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 10 }),
    })])
    const summary = getTimeLimitUsageSummary(
      s.groups[0],
      { logicalDate: '2026-05-05', consumedSec: 600 },
      new Date('2026-05-06T12:00:00+09:00'),
      s.global,
    )
    expect(summary?.consumedSec).toBe(0)
    expect(summary?.remainingSec).toBe(600)
  })

  it('今日にマッチする上限がなければ残り時間を返さない', () => {
    const s = settings([group({
      scheduleRules: weeklyScheduleRules([1], { dailyLimitMinutes: 10 }),
    })])
    expect(getTimeLimitUsageSummary(s.groups[0], undefined, new Date('2026-05-06T12:00:00+09:00'), s.global)).toBeUndefined()
  })

  it('disabled group の残り時間 summary は返さない', () => {
    const s = settings([group({
      disabled: true,
      scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 10 }),
    })])

    expect(getTimeLimitUsageSummary(s.groups[0], undefined, new Date('2026-05-06T12:00:00+09:00'), s.global)).toBeUndefined()
    expect(getMinimumRemainingTimeLimit(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'))).toBeUndefined()
  })

  it('残り秒数を切り上げの分単位 badge 文字列にする', () => {
    expect(formatRemainingMinutesBadge(61)).toBe('2m')
    expect(formatRemainingMinutesBadge(60)).toBe('1m')
    expect(formatRemainingMinutesBadge(1)).toBe('1m')
    expect(formatRemainingMinutesBadge(0)).toBe('0m')
    expect(formatRemainingMinutesBadge(-1)).toBe('0m')
  })

  it('対象 URL の有効上限から最短の残り時間を返す', () => {
    const s = settings([
      group({ id: 'long', patterns: ['example'], scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 30 }) }),
      group({ id: 'short', patterns: ['example'], scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 10 }) }),
      group({ id: 'other', patterns: ['other'], scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 1 }) }),
    ])
    const counters = {
      counters: {
        long: { logicalDate: '2026-05-06', consumedSec: 60 },
        short: { logicalDate: '2026-05-06', consumedSec: 540 },
        other: { logicalDate: '2026-05-06', consumedSec: 0 },
      },
    }
    const result = getMinimumRemainingTimeLimit(s, counters, 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'))
    expect(result?.group.id).toBe('short')
    expect(result?.summary.remainingSec).toBe(60)
  })

  it('対象 URL に今日有効な上限がなければ最短残り時間を返さない', () => {
    const s = settings([group({
      scheduleRules: weeklyScheduleRules([1], { dailyLimitMinutes: 10 }),
    })])
    expect(getMinimumRemainingTimeLimit(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'))).toBeUndefined()
  })

  it('URL に該当するすべての group に加算する', () => {
    const s = settings([
      group({ id: 'a', patterns: ['example'] }),
      group({ id: 'b', patterns: ['\\.com'] }),
    ])
    const counters = incrementCounters(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'), 1)
    expect(counters.counters.a.consumedSec).toBe(1)
    expect(counters.counters.b.consumedSec).toBe(1)
  })

  it('disabled group の counter は正規化でも加算でも対象外にする', () => {
    const s = settings([
      group({ id: 'enabled', patterns: ['example'] }),
      group({ id: 'disabled', disabled: true, patterns: ['example'] }),
    ])
    const normalized = normalizeCounters(s, {
      counters: {
        enabled: { logicalDate: '2026-05-06', consumedSec: 10 },
        disabled: { logicalDate: '2026-05-06', consumedSec: 20 },
      },
    }, new Date('2026-05-06T12:00:00+09:00'))
    const incremented = incrementCounters(s, normalized, 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'), 1)

    expect(normalized.counters).toEqual({
      enabled: { logicalDate: '2026-05-06', consumedSec: 10 },
    })
    expect(incremented.counters).toEqual({
      enabled: { logicalDate: '2026-05-06', consumedSec: 11 },
    })
  })

  it('一時停止中でも counter 加算対象は変わらない', () => {
    const s = settings([group({ id: 'paused', patterns: ['example'] })])
    const counters = incrementCounters(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'), 1)

    expect(counters.counters.paused.consumedSec).toBe(1)
  })

  it('論理日が変わった counter は 0 にし、削除済み group は除去する', () => {
    const s = settings([group({ id: 'keep' })])
    const normalized = normalizeCounters(s, {
      counters: {
        keep: { logicalDate: '2026-05-05', consumedSec: 10 },
        removed: { logicalDate: '2026-05-06', consumedSec: 20 },
      },
    }, new Date('2026-05-06T12:00:00+09:00'))
    expect(normalized.counters).toEqual({
      keep: { logicalDate: '2026-05-06', consumedSec: 0 },
    })
  })
})
