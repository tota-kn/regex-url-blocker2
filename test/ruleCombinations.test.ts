import { describe, expect, it } from 'vitest'
import { applyDelayGrantState, applyGroupPauseState, evaluateUrl } from '../utils/blocking'
import { getBlockDestination, getBlockReason, getEffectiveWait } from '../utils/groupStatus'
import { incrementEffectiveCounters } from '../utils/usageCounters'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import { describeCurrentState } from '../utils/rules'
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
    pauseWaitSeconds: 60,
    pauseDurationMinutes: 10,
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
    const reason = getBlockReason(s.groups[0]!, counters(0).counters.g1, at('12:00'), s.global)
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
    const next = incrementEffectiveCounters(s, s, counters(0), URL, at('12:05'), 60)
    expect(next.counters.g1?.consumedSec).toBe(60)
  })

  it('遷移先はブロックを起こしたルールのものを使う', () => {
    const s = settingsWith(
      rule('daily', { kind: 'dailyLimit', minutes: 30 }, 'https://daily.test/'),
      rule('block', { kind: 'block' }, 'https://block.test/'),
    )

    const blockReason = getBlockReason(s.groups[0]!, counters(0).counters.g1, at('12:00'), s.global)
    expect(getBlockDestination(blockReason!)).toEqual({
      type: 'redirect',
      url: 'https://block.test/',
    })

    const dailyOnly = settingsWith(
      rule('daily', { kind: 'dailyLimit', minutes: 30 }, 'https://daily.test/'),
    )
    const dailyReason = getBlockReason(
      dailyOnly.groups[0]!,
      counters(30 * 60).counters.g1,
      at('12:00'),
      dailyOnly.global,
    )
    expect(getBlockDestination(dailyReason!)).toEqual({
      type: 'redirect',
      url: 'https://daily.test/',
    })
  })
})

describe('画面表示は実際に課される制限と一致する', () => {
  it('Wait ルールが2件重なるとき、説明文は秒数・許可分数とも最長を示す', () => {
    // seconds は A が長く、grantMinutes は B が長い。実際に課されるのは 60 秒 / 20 分。
    const a = rule('wait-a', { kind: 'wait', seconds: 60, grantMinutes: 5 })
    const b = rule('wait-b', { kind: 'wait', seconds: 30, grantMinutes: 20 })
    const s = settingsWith(a, b)
    const now = at('12:00')

    const effective = getEffectiveWait(s.groups[0]!, now, s.global)
    expect(effective).toEqual({ seconds: 60, grantMinutes: 20 })

    const summary = describeCurrentState(s.groups[0]!.rules, now, s.global)
    expect(summary.kind).toBe('gated')
    expect(summary.lines[0]).toContain(`Wait ${effective!.seconds} sec`)
    expect(summary.lines[0]).toContain(`browse for ${effective!.grantMinutes} min`)
  })

  it('seconds が 0 の Wait は待機を課さないので gated にならない', () => {
    const s = settingsWith(rule('wait-zero', { kind: 'wait', seconds: 0, grantMinutes: 10 }))
    const now = at('12:00')

    expect(getEffectiveWait(s.groups[0]!, now, s.global)).toBeUndefined()

    const summary = describeCurrentState(s.groups[0]!.rules, now, s.global)
    expect(summary.kind).not.toBe('gated')
    expect(summary.headline).not.toBe('Wait required before access')
  })

  it('grantMinutes が 1 未満の Wait も待機を課さない', () => {
    const s = settingsWith(rule('wait-nogrant', { kind: 'wait', seconds: 60, grantMinutes: 0 }))
    const now = at('12:00')

    expect(getEffectiveWait(s.groups[0]!, now, s.global)).toBeUndefined()
    expect(describeCurrentState(s.groups[0]!.rules, now, s.global).kind).not.toBe('gated')
  })

  it('Daily limit ルールが2件重なるとき、説明文は最小分数を示す', () => {
    const s = settingsWith(
      rule('daily-long', { kind: 'dailyLimit', minutes: 60 }),
      rule('daily-short', { kind: 'dailyLimit', minutes: 15 }),
    )
    const now = at('12:00')

    const summary = describeCurrentState(s.groups[0]!.rules, now, s.global)
    expect(summary.lines.join(' ')).toContain('15 min')
    // 実際にブロックされるのも 15 分ぶんを使い切った時点。
    expect(evaluateUrl(s, counters(15 * 60), URL, now).blocked).toBe(true)
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
    expect(
      incrementEffectiveCounters(s, s, counters(0), URL, at('10:00'), 60).counters.g1?.consumedSec,
    ).toBe(60)
    // 午後は Wait しかアクティブでないので加算しない。
    expect(
      incrementEffectiveCounters(s, s, counters(0), URL, at('15:00'), 60).counters.g1?.consumedSec,
    ).toBe(0)
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
