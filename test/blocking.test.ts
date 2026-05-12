import { describe, expect, it } from 'vitest'
import {
  evaluateUrl,
  formatRemainingMinutesBadge,
  getLogicalDate,
  getMinimumRemainingTimeLimit,
  getTargetGroupIds,
  getTimeLimitUsageSummary,
  incrementCounters,
  normalizeCounters,
  shouldSkipUrl,
} from '../utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyDailyRules } from '../utils/defaults'
import type { DailyRule, DayOfWeek, Group, Settings, UsageCountersState } from '../utils/types'

/**
 * テスト用のグループを生成する。
 */
function group(overrides: Partial<Group>): Group {
  return {
    id: 'g1',
    name: 'Group',
    mode: 'blacklist',
    patterns: ['example\\.com'],
    dailyRules: createEmptyDailyRules(),
    ...overrides,
  }
}

/**
 * 指定曜日のルールだけ差し替えた7曜日分のルールを返す。
 */
function dailyRule(dayOfWeek: DayOfWeek, override: Partial<DailyRule>): DailyRule[] {
  return createEmptyDailyRules().map(rule =>
    rule.dayOfWeek === dayOfWeek ? { ...rule, ...override } : rule,
  )
}

/**
 * すべての曜日へ同じルールを適用した7曜日分のルールを返す。
 */
function allDailyRules(override: Partial<DailyRule>): DailyRule[] {
  return createEmptyDailyRules().map(rule => ({ ...rule, ...override }))
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
})

describe('logical date', () => {
  it('リセット時刻前は前日を論理日にし、曜日も論理日開始時点で判定する', () => {
    const info = getLogicalDate(new Date('2026-05-06T02:59:00+09:00'), '03:00')
    expect(info.logicalDate).toBe('2026-05-05')
    expect(info.dayOfWeek).toBe(2)
  })
})

describe('blocking evaluation', () => {
  it('通常時間帯のブロックを判定する', () => {
    const s = settings([group({
      dailyRules: allDailyRules({ blockedTimeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }] }),
    })])
    const result = evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T10:00:00+09:00'))
    expect(result.blocked).toBe(true)
    expect(result.blockedGroupIds).toEqual(['g1'])
  })

  it('日跨ぎ時間帯のブロックを判定する', () => {
    const s = settings([group({
      dailyRules: allDailyRules({ blockedTimeRanges: [{ startMinute: 22 * 60, endMinute: 6 * 60 }] }),
    })])
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T23:00:00+09:00')).blocked).toBe(true)
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T05:59:00+09:00')).blocked).toBe(true)
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00')).blocked).toBe(false)
  })

  it('start と end が同じ時間帯は 24 時間ブロックにする', () => {
    const s = settings([group({
      dailyRules: allDailyRules({ blockedTimeRanges: [{ startMinute: 0, endMinute: 0 }] }),
    })])
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00')).blocked).toBe(true)
  })

  it('曜日指定は論理日開始時点の曜日で判定する', () => {
    const s = settings([group({
      dailyRules: dailyRule(2, { blockedTimeRanges: [{ startMinute: 0, endMinute: 1440 }] }),
    })], '03:00')
    expect(evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T02:00:00+09:00')).blocked).toBe(true)
  })

  it('0 分上限は即ブロックにする', () => {
    const s = settings([group({
      dailyRules: allDailyRules({ dailyLimitMinutes: 0 }),
    })])
    const result = evaluateUrl(s, emptyCounters(), 'https://example.com/', new Date('2026-05-06T12:00:00+09:00'))
    expect(result.blocked).toBe(true)
  })

  it('https?://x.com.* と 0 分上限で x.com をブロックする', () => {
    const s = settings([group({
      patterns: ['https?://x.com.*'],
      dailyRules: allDailyRules({ dailyLimitMinutes: 0 }),
    })])
    const result = evaluateUrl(s, emptyCounters(), 'https://x.com/', new Date('2026-05-06T12:00:00+09:00'))
    expect(result.blocked).toBe(true)
  })

  it('上限秒数以上のカウンタでブロックする', () => {
    const s = settings([group({ dailyRules: allDailyRules({ dailyLimitMinutes: 1 }) })])
    const counters = { counters: { g1: { logicalDate: '2026-05-06', consumedSec: 60 } } }
    expect(evaluateUrl(s, counters, 'https://example.com/', new Date('2026-05-06T12:00:00+09:00')).blocked).toBe(true)
  })
})

describe('counters', () => {
  it('今日の曜日に該当する上限から残り秒数を算出する', () => {
    const s = settings([group({
      dailyRules: dailyRule(3, { dailyLimitMinutes: 30 }),
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
      dailyRules: dailyRule(3, { dailyLimitMinutes: 20 }),
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
      dailyRules: allDailyRules({ dailyLimitMinutes: 10 }),
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

  it('今日有効な上限がなければ残り時間を返さない', () => {
    const s = settings([group({
      dailyRules: dailyRule(1, { dailyLimitMinutes: 10 }),
    })])
    expect(getTimeLimitUsageSummary(s.groups[0], undefined, new Date('2026-05-06T12:00:00+09:00'), s.global)).toBeUndefined()
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
      group({ id: 'long', patterns: ['example'], dailyRules: allDailyRules({ dailyLimitMinutes: 30 }) }),
      group({ id: 'short', patterns: ['example'], dailyRules: allDailyRules({ dailyLimitMinutes: 10 }) }),
      group({ id: 'other', patterns: ['other'], dailyRules: allDailyRules({ dailyLimitMinutes: 1 }) }),
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
      dailyRules: dailyRule(1, { dailyLimitMinutes: 10 }),
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
