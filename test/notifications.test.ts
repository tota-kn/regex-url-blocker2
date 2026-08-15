import { describe, expect, it } from 'vitest'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import { buildEffectiveRemainingTimeNotificationPlans } from '../utils/notifications'
import type { Group, Settings, UsageCountersState, UsageNotificationEntry } from '../utils/types'
import { dailyRule } from './helpers'

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
    pauseAllowed: true,
    ...dailyRule({ kind: 'dailyLimit', minutes: 60 }),
    ...overrides,
    pauseWaitSeconds: overrides.pauseWaitSeconds ?? 60,
    pauseDurationMinutes: overrides.pauseDurationMinutes ?? 10,
  }
}

/**
 * テスト用設定を生成する。
 */
function settings(groups: Group[], overrides: Partial<Settings['global']> = {}): Settings {
  return {
    global: {
      ...DEFAULT_GLOBAL_SETTINGS,
      dailyResetHour: '00:00',
      notificationThresholdMinutes: 5,
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
    counters: Object.fromEntries(
      Object.entries(consumedSecByGroupId).map(([groupId, consumedSec]) => [
        groupId,
        { logicalDate: LOGICAL_DATE, consumedSec },
      ]),
    ),
  }
}

describe('remaining time notification plans', () => {
  it('閾値以下の未通知グループに通知計画を作る', () => {
    const s = settings([group()])

    const plans = buildEffectiveRemainingTimeNotificationPlans(
      s,
      s,
      counters({ 'group-a': 57 * 60 }),
      {},
      'https://example.com/',
      NOW,
    )

    expect(plans).toEqual([
      {
        notificationId: `usage-time-limit-group-a-${LOGICAL_DATE}`,
        message: 'Group A: 3 minutes remaining today.',
        historyEntries: [{ groupId: 'group-a', logicalDate: LOGICAL_DATE }],
      },
    ])
  })

  it('同じ論理日に通知済みなら通知計画を作らない', () => {
    const s = settings([group()])
    const history: Record<string, UsageNotificationEntry> = {
      'group-a': { logicalDate: LOGICAL_DATE },
    }

    expect(
      buildEffectiveRemainingTimeNotificationPlans(
        s,
        s,
        counters({ 'group-a': 57 * 60 }),
        history,
        'https://example.com/',
        NOW,
      ),
    ).toEqual([])
  })

  it('残り時間通知が無効なら通知計画を作らない', () => {
    const s = settings([group()], { remainingTimeNotificationsEnabled: false })

    expect(
      buildEffectiveRemainingTimeNotificationPlans(
        s,
        s,
        counters({ 'group-a': 57 * 60 }),
        {},
        'https://example.com/',
        NOW,
      ),
    ).toEqual([])
  })
})
