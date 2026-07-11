import { describe, expect, it } from 'vitest'
import { evaluateUrl } from '../utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import {
  buildPageOpenNotificationPlan,
  buildRedirectBlockNotificationPlan,
  buildRemainingTimeNotificationPlans,
  markNotificationPlanHistory,
} from '../utils/notifications'
import type { Group, Settings, UsageCountersState, UsageNotificationEntry } from '../utils/types'
import { dailyRestriction } from './helpers'

const NOW = new Date('2026-05-06T12:00:00+09:00')
const LOGICAL_DATE = '2026-05-06'

/**
 * テスト用グループを生成する。
 */
function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-a',
    name: 'Group A',
    mode: 'blacklist',
    disabled: false,
    lockMode: false,
    patterns: ['example\\.com'],
    blockAction: 'redirect',
    redirectUrl: 'https://blocked.test/',
    restriction: dailyRestriction('grace', { graceMinutes: 60 }),
    ...overrides,
  }
}

/**
 * テスト用設定を生成する。
 */
function settings(groups: Group[], overrides: Partial<Settings['global']> = {}): Settings {
  return {
    global: {
      ...DEFAULT_GLOBAL_SETTINGS,
      blockAction: 'redirect',
      redirectUrl: 'https://blocked.test/',
      dailyResetHour: '00:00',
      notificationThresholdMinutes: 5,
      pageOpenNotificationsEnabled: true,
      blockNotificationsEnabled: true,
      ...overrides,
    },
    groups,
  }
}

/**
 * テスト用 counter 状態を生成する。
 */
function counters(consumedSecByGroupId: Record<string, number>): UsageCountersState {
  return {
    counters: Object.fromEntries(Object.entries(consumedSecByGroupId).map(([groupId, consumedSec]) => [
      groupId,
      { logicalDate: LOGICAL_DATE, consumedSec },
    ])),
  }
}

describe('remaining time notification plans', () => {
  it('閾値以下の未通知グループに通知計画を作る', () => {
    const s = settings([group()])

    const plans = buildRemainingTimeNotificationPlans(
      s,
      counters({ 'group-a': 57 * 60 }),
      {},
      'https://example.com/',
      NOW,
    )

    expect(plans).toEqual([{
      notificationId: `usage-time-limit-group-a-${LOGICAL_DATE}`,
      message: 'Group A: 3 minutes remaining today.',
      historyEntries: [{ groupId: 'group-a', logicalDate: LOGICAL_DATE }],
    }])
  })

  it('同じ論理日に通知済みなら通知計画を作らない', () => {
    const s = settings([group()])
    const history: Record<string, UsageNotificationEntry> = {
      'group-a': { logicalDate: LOGICAL_DATE },
    }

    expect(buildRemainingTimeNotificationPlans(
      s,
      counters({ 'group-a': 57 * 60 }),
      history,
      'https://example.com/',
      NOW,
    )).toEqual([])
  })

  it('残り時間通知が無効なら通知計画を作らない', () => {
    const s = settings([group()], { remainingTimeNotificationsEnabled: false })

    expect(buildRemainingTimeNotificationPlans(
      s,
      counters({ 'group-a': 57 * 60 }),
      {},
      'https://example.com/',
      NOW,
    )).toEqual([])
  })
})

describe('page open notification plans', () => {
  it('複数グループに該当する対象ページ通知を1件にまとめる', () => {
    const s = settings([
      group({ id: 'multi-a', name: 'Multi A' }),
      group({ id: 'multi-b', name: 'Multi B' }),
    ])
    const evaluation = evaluateUrl(s, counters({ 'multi-a': 0, 'multi-b': 0 }), 'https://example.com/', NOW)

    const plan = buildPageOpenNotificationPlan(
      s,
      counters({ 'multi-a': 0, 'multi-b': 0 }),
      {},
      evaluation,
      NOW,
    )

    expect(plan).toEqual({
      notificationId: `page-open-limit-${LOGICAL_DATE}-multi-a-multi-b`,
      message: 'Time limit applies to Multi A, Multi B today.',
      historyEntries: [
        { groupId: 'multi-a', logicalDate: LOGICAL_DATE },
        { groupId: 'multi-b', logicalDate: LOGICAL_DATE },
      ],
    })
  })

  it('対象ページ通知が無効なら通知計画を作らない', () => {
    const s = settings([group()], { pageOpenNotificationsEnabled: false })
    const evaluation = evaluateUrl(s, counters({ 'group-a': 0 }), 'https://example.com/', NOW)

    expect(buildPageOpenNotificationPlan(
      s,
      counters({ 'group-a': 0 }),
      {},
      evaluation,
      NOW,
    )).toBeUndefined()
  })
})

describe('redirect block notification plans', () => {
  it('redirect ブロック通知を同じ論理日では1回にする', () => {
    const s = settings([group({ restriction: dailyRestriction('grace', { graceMinutes: 0 }) })])
    const evaluation = evaluateUrl(s, counters({ 'group-a': 0 }), 'https://example.com/', NOW)
    const history: Record<string, UsageNotificationEntry> = {}

    const first = buildRedirectBlockNotificationPlan(s, history, evaluation, 'https://blocked.test/', NOW)
    expect(first?.notificationId).toBe(`redirect-block-${LOGICAL_DATE}-group-a`)
    expect(first?.message).toBe('Blocked and redirected: Group A.')

    markNotificationPlanHistory(first!, history)
    expect(buildRedirectBlockNotificationPlan(s, history, evaluation, 'https://blocked.test/', NOW)).toBeUndefined()
  })

  it('redirect ブロック通知が無効なら通知計画を作らない', () => {
    const s = settings([
      group({ restriction: dailyRestriction('grace', { graceMinutes: 0 }) }),
    ], { blockNotificationsEnabled: false })
    const evaluation = evaluateUrl(s, counters({ 'group-a': 0 }), 'https://example.com/', NOW)

    expect(buildRedirectBlockNotificationPlan(s, {}, evaluation, 'https://blocked.test/', NOW)).toBeUndefined()
  })

  it('blockedPage グループには redirect ブロック通知計画を作らない', () => {
    const s = settings([
      group({
        blockAction: 'blockedPage',
        restriction: dailyRestriction('grace', { graceMinutes: 0 }),
      }),
    ])
    const evaluation = evaluateUrl(s, counters({ 'group-a': 0 }), 'https://example.com/', NOW)

    expect(buildRedirectBlockNotificationPlan(s, {}, evaluation, 'https://blocked.test/', NOW)).toBeUndefined()
  })
})
