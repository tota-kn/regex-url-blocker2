import { describe, expect, it } from 'vitest'
import {
  applyDelayGrantState,
  applyGroupPauseState,
  evaluateUrl,
  getBlockDestination,
  getBlockReason,
  incrementCounters,
} from '../utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import type { Group, Rule, RuleRestriction, Settings, UsageCountersState } from '../utils/types'

const URL = 'https://example.com/'
const DATE = '2026-05-06' // 水曜
const at = (time: string): Date => new Date(`${DATE}T${time}+09:00`)

/** 常時ウィンドウのルールを1件作る。 */
function rule(id: string, restriction: RuleRestriction, redirectUrl?: string): Rule {
  return {
    id,
    window: { type: 'always' },
    restriction,
    ...(restriction.kind === 'wait'
      ? {}
      : {
          destination: redirectUrl
            ? ({ type: 'redirect', url: redirectUrl } as const)
            : ({ type: 'blockedPage' } as const),
        }),
  }
}

/** 指定ルールを持つ設定を作る。 */
function settingsWith(...rules: Rule[]): Settings {
  const group: Group = {
    id: 'g1',
    name: 'Group',
    mode: 'blacklist',
    disabled: false,
    lockMode: false,
    patterns: ['example\\.com'],
    pauseAllowed: true,
    rules,
  }
  return { global: { ...DEFAULT_GLOBAL_SETTINGS, dailyResetHour: '00:00' }, groups: [group] }
}

/** 指定消費秒数のカウンタを作る。 */
function counters(consumedSec: number): UsageCountersState {
  return { counters: { g1: { logicalDate: DATE, consumedSec } } }
}

const BLOCK = rule('block', { kind: 'block' })
const SESSION = rule('session', { kind: 'sessionLimit', sessionMinutes: 10, breakMinutes: 30 })
const DAILY = rule('daily', { kind: 'dailyLimit', minutes: 30 })
const WAIT = rule('wait', { kind: 'wait', seconds: 60, grantMinutes: 10 })

describe('ルールの組み合わせ表', () => {
  it('Block × Wait — Block が勝ち、Wait ページには到達しない', () => {
    const evaluation = evaluateUrl(settingsWith(BLOCK, WAIT), counters(0), URL, at('12:00'))
    expect(evaluation.blocked).toBe(true)
    // 待機対象としては算出されるが、enforce ではハードブロックが優先される。
    expect(evaluation.delayedGroupIds).toEqual(['g1'])
  })

  it('Block × Daily limit — Daily limit に残りがあっても Block でブロックする', () => {
    const s = settingsWith(BLOCK, DAILY)
    const reason = getBlockReason(
      s.groups[0]!,
      counters(0).counters.g1,
      undefined,
      at('12:00'),
      s.global,
    )
    expect(reason?.kind).toBe('block')
  })

  it('Daily limit × Wait — 残りがあるうちは Wait だけ、使い切ると Block になる', () => {
    const s = settingsWith(DAILY, WAIT)

    const before = evaluateUrl(s, counters(29 * 60), URL, at('12:00'))
    expect(before.blocked).toBe(false)
    expect(before.delayedGroupIds).toEqual(['g1'])

    const after = evaluateUrl(s, counters(30 * 60), URL, at('12:00'))
    expect(after.blocked).toBe(true)
  })

  it('Daily limit × Wait — Wait 通過後の許可期間中も Daily limit は減る', () => {
    const s = settingsWith(DAILY, WAIT)
    const granted = applyDelayGrantState(
      evaluateUrl(s, counters(0), URL, at('12:00')),
      { delayGrantState: { g1: { grantedUntil: at('12:10').getTime() } } },
      at('12:00').getTime(),
    )
    // 許可期間中は待機ページへ飛ばさない。
    expect(granted.delayedGroupIds).toEqual([])

    // その間もカウンタは進む。
    const next = incrementCounters(s, counters(0), URL, at('12:05'), 60)
    expect(next.counters.g1?.consumedSec).toBe(60)
  })

  it('Session limit × Wait — 休憩中は Wait より優先してブロックする', () => {
    const s = settingsWith(SESSION, WAIT)
    const startedAt = at('12:00').getTime()
    const state = { sessionLimitState: { g1: { startedAt } } }

    const during = evaluateUrl(s, counters(0), URL, at('12:05'), state)
    expect(during.blocked).toBe(false)

    const onBreak = evaluateUrl(s, counters(0), URL, at('12:15'), state)
    expect(onBreak.blocked).toBe(true)

    const afterBreak = evaluateUrl(s, counters(0), URL, at('12:45'), state)
    expect(afterBreak.blocked).toBe(false)
  })

  it('Daily limit × Session limit — 先に尽きた方でブロックし、理由もそちらになる', () => {
    const s = settingsWith(SESSION, DAILY)
    const startedAt = at('12:00').getTime()
    const state = { sessionLimitState: { g1: { startedAt } } }

    // 休憩が先に来る（利用枠10分）。
    const sessionFirst = getBlockReason(
      s.groups[0]!,
      counters(5 * 60).counters.g1,
      state.sessionLimitState.g1,
      at('12:15'),
      s.global,
    )
    expect(sessionFirst?.kind).toBe('sessionLimit')

    // 休憩明けに Daily limit を使い切っていればそちらでブロックする。
    const dailyLater = getBlockReason(
      s.groups[0]!,
      counters(30 * 60).counters.g1,
      state.sessionLimitState.g1,
      at('12:45'),
      s.global,
    )
    expect(dailyLater?.kind).toBe('dailyLimit')
  })

  it('遷移先はブロックを起こしたルールのものを使う', () => {
    const s = settingsWith(
      rule('daily', { kind: 'dailyLimit', minutes: 30 }, 'https://daily.test/'),
      rule(
        'session',
        { kind: 'sessionLimit', sessionMinutes: 10, breakMinutes: 30 },
        'https://session.test/',
      ),
    )
    const startedAt = at('12:00').getTime()

    const sessionReason = getBlockReason(
      s.groups[0]!,
      counters(0).counters.g1,
      { startedAt },
      at('12:15'),
      s.global,
    )
    expect(getBlockDestination(sessionReason!)).toEqual({
      type: 'redirect',
      url: 'https://session.test/',
    })

    const dailyReason = getBlockReason(
      s.groups[0]!,
      counters(30 * 60).counters.g1,
      undefined,
      at('12:00'),
      s.global,
    )
    expect(getBlockDestination(dailyReason!)).toEqual({
      type: 'redirect',
      url: 'https://daily.test/',
    })
  })
})

describe('Daily limit ルールがアクティブな時間帯だけカウンタを進める', () => {
  it('Wait だけがアクティブな時間帯では加算しない', () => {
    const s = settingsWith(WAIT, {
      id: 'daily-morning',
      window: {
        type: 'scheduled',
        condition: { type: 'weekly', daysOfWeek: [3] },
        timeRanges: [{ startMinute: 9 * 60, endMinute: 12 * 60 }],
      },
      restriction: { kind: 'dailyLimit', minutes: 30 },
      destination: { type: 'blockedPage' },
    })

    // 午前は Daily limit が有効なので加算する。
    expect(incrementCounters(s, counters(0), URL, at('10:00'), 60).counters.g1?.consumedSec).toBe(
      60,
    )
    // 午後は Wait しかアクティブでないので加算しない。
    expect(incrementCounters(s, counters(0), URL, at('15:00'), 60).counters.g1?.consumedSec).toBe(0)
  })
})

describe('Pause は Block も Wait も解除する', () => {
  it('一時停止中はブロック対象からも待機対象からも外れる', () => {
    const s = settingsWith(BLOCK, WAIT)
    const now = at('12:00').getTime()
    const evaluation = evaluateUrl(s, counters(0), URL, at('12:00'))
    expect(evaluation.blockedGroupIds).toEqual(['g1'])
    expect(evaluation.delayedGroupIds).toEqual(['g1'])

    const paused = applyGroupPauseState(
      evaluation,
      { groupPauseState: { g1: { pausedUntil: now + 60_000 } } },
      now,
    )
    expect(paused.blocked).toBe(false)
    expect(paused.blockedGroupIds).toEqual([])
    expect(paused.delayedGroupIds).toEqual([])
  })

  it('一時停止が切れたら両方とも戻る', () => {
    const s = settingsWith(BLOCK, WAIT)
    const now = at('12:00').getTime()
    const paused = applyGroupPauseState(
      evaluateUrl(s, counters(0), URL, at('12:00')),
      { groupPauseState: { g1: { pausedUntil: now - 1 } } },
      now,
    )
    expect(paused.blockedGroupIds).toEqual(['g1'])
    expect(paused.delayedGroupIds).toEqual(['g1'])
  })
})
