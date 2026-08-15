import { describe, expect, it } from 'vitest'
import { migrateLegacyRules } from '../utils/migrateLegacy'
import { sortRulesByEvaluationOrder } from '../utils/groupStatus'
import { buildRule } from '../utils/ruleFactory'
import type { LegacyRestriction } from '../utils/migrateLegacy'
import type { TimeWindow } from '../utils/types'

const always: TimeWindow = { type: 'always' }
const weekdayMorning: TimeWindow = {
  type: 'scheduled',
  condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
  timeRanges: [{ startMinute: 540, endMinute: 720 }],
}

describe('migrateLegacyRules', () => {
  it('timeWindows × restrictions を直積展開する', () => {
    const rules = migrateLegacyRules({
      groupId: 'g1',
      timeWindows: [always, weekdayMorning],
      restrictions: [{ type: 'grace', graceMinutes: 30 }, { type: 'block' }],
    })

    expect(rules).toHaveLength(4)
    // すべての window にすべての restriction が付く。これが旧モデルの直積そのもの。
    expect(rules.filter((rule) => rule.restriction.kind === 'block')).toHaveLength(2)
    expect(rules.filter((rule) => rule.restriction.kind === 'dailyLimit')).toHaveLength(2)
  })

  it('rule id は group id と位置から決定的に採番する', () => {
    const input = {
      groupId: 'g1',
      timeWindows: [always],
      restrictions: [{ type: 'block' } satisfies LegacyRestriction],
    }
    expect(migrateLegacyRules(input)[0]?.id).toBe('g1:w0:r0')
    // 同じ入力からは常に同じ id を得る。基準設定と最新設定の差分誤検出を防ぐため。
    expect(migrateLegacyRules(input)).toEqual(migrateLegacyRules(input))
  })

  it('grace は dailyLimit へ、wait はそのまま移行する', () => {
    const rules = migrateLegacyRules({
      groupId: 'g1',
      timeWindows: [always],
      restrictions: [
        { type: 'grace', graceMinutes: 45 },
        { type: 'wait', waitSeconds: 30, waitGrantMinutes: 5 },
      ],
    })

    expect(rules.map((rule) => rule.restriction)).toEqual([
      { kind: 'dailyLimit', minutes: 45 },
      { kind: 'wait', seconds: 30, grantMinutes: 5 },
    ])
  })

  it('grace が 0 分または未設定なら block へ畳む', () => {
    const zero = migrateLegacyRules({
      groupId: 'g1',
      timeWindows: [always],
      restrictions: [{ type: 'grace', graceMinutes: 0 }],
    })
    const missing = migrateLegacyRules({
      groupId: 'g1',
      timeWindows: [always],
      restrictions: [{ type: 'grace' }],
    })

    expect(zero[0]?.restriction).toEqual({ kind: 'block' })
    expect(missing[0]?.restriction).toEqual({ kind: 'block' })
  })

  it('redirect は block + 遷移先 URL へ畳む', () => {
    const rules = migrateLegacyRules({
      groupId: 'g1',
      timeWindows: [always],
      restrictions: [{ type: 'redirect', redirectUrl: 'https://elsewhere.test/' }],
    })

    expect(rules[0]?.restriction).toEqual({ kind: 'block' })
    expect(rules[0]?.destination).toEqual({ type: 'redirect', url: 'https://elsewhere.test/' })
  })

  it('遷移先は restriction → group → global の順にフォールバックする', () => {
    const base = {
      groupId: 'g1',
      timeWindows: [always],
      restrictions: [{ type: 'block' } satisfies LegacyRestriction],
    }

    expect(migrateLegacyRules(base)[0]?.destination).toEqual({ type: 'blockedPage' })
    expect(
      migrateLegacyRules({ ...base, fallbackRedirectUrl: 'https://fallback.test/' })[0]
        ?.destination,
    ).toEqual({ type: 'redirect', url: 'https://fallback.test/' })
    expect(
      migrateLegacyRules({
        ...base,
        restrictions: [{ type: 'redirect', redirectUrl: 'https://own.test/' }],
        fallbackRedirectUrl: 'https://fallback.test/',
      })[0]?.destination,
    ).toEqual({ type: 'redirect', url: 'https://own.test/' })
  })

  it('wait は遷移先を持たない', () => {
    const rules = migrateLegacyRules({
      groupId: 'g1',
      timeWindows: [always],
      restrictions: [{ type: 'wait', waitSeconds: 30 }],
      fallbackRedirectUrl: 'https://global.test/',
    })
    expect(rules[0]?.destination).toBeUndefined()
  })

  it('欠損値は既定値で補完する', () => {
    const rules = migrateLegacyRules({
      groupId: 'g1',
      timeWindows: [always],
      restrictions: [{ type: 'wait', waitSeconds: 30 }],
    })
    expect(rules.map((rule) => rule.restriction)).toEqual([
      { kind: 'wait', seconds: 30, grantMinutes: 10 },
    ])
  })

  it('window が空なら1件もルールを作らない（旧モデルでも無反応だったため）', () => {
    expect(
      migrateLegacyRules({ groupId: 'g1', timeWindows: [], restrictions: [{ type: 'block' }] }),
    ).toEqual([])
  })
})

describe('sortRulesByEvaluationOrder', () => {
  const rule = (kind: 'block' | 'dailyLimit' | 'wait', id: string) =>
    buildRule(
      id,
      always,
      kind === 'block'
        ? ({ kind } as const)
        : kind === 'dailyLimit'
          ? ({ kind, minutes: 30 } as const)
          : ({ kind, seconds: 60, grantMinutes: 10 } as const),
    )

  it('Block → Daily limit → Wait の順へ並べ替える', () => {
    const sorted = sortRulesByEvaluationOrder([
      rule('wait', 'a'),
      rule('dailyLimit', 'b'),
      rule('block', 'c'),
    ])
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('同種は元の並び順を保つ（安定ソート）', () => {
    const sorted = sortRulesByEvaluationOrder([
      rule('dailyLimit', 'first'),
      rule('dailyLimit', 'second'),
      rule('block', 'block'),
    ])
    expect(sorted.map((r) => r.id)).toEqual(['block', 'first', 'second'])
  })

  it('冪等', () => {
    const input = [rule('wait', 'a'), rule('block', 'b'), rule('dailyLimit', 'c')]
    const once = sortRulesByEvaluationOrder(input)
    expect(sortRulesByEvaluationOrder(once)).toEqual(once)
  })

  it('元の配列を書き換えない', () => {
    const input = [rule('wait', 'a'), rule('block', 'b')]
    sortRulesByEvaluationOrder(input)
    expect(input.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
