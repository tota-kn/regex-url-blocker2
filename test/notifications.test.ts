import { describe, expect, it } from 'vitest'
import { buildEffectiveRemainingTimeNotificationPlans } from '../utils/notifications'
import type { UsageNotificationEntry } from '../utils/types'
import { counters, dailyRule, group, settings } from './helpers'

const NOW = new Date('2026-05-06T12:00:00+09:00')
const LOGICAL_DATE = '2026-05-06'

const GROUP = group({
  id: 'group-a',
  name: 'Group A',
  ...dailyRule({ kind: 'dailyLimit', minutes: 60 }),
})

describe('remaining time notification plans', () => {
  it('閾値以下の未通知グループに通知計画を作る', () => {
    const s = settings([GROUP], { notificationThresholdMinutes: 5 })

    const plans = buildEffectiveRemainingTimeNotificationPlans(
      s,
      s,
      counters({ 'group-a': 57 * 60 }, LOGICAL_DATE),
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
    const s = settings([GROUP], { notificationThresholdMinutes: 5 })
    const history: Record<string, UsageNotificationEntry> = {
      'group-a': { logicalDate: LOGICAL_DATE },
    }

    expect(
      buildEffectiveRemainingTimeNotificationPlans(
        s,
        s,
        counters({ 'group-a': 57 * 60 }, LOGICAL_DATE),
        history,
        'https://example.com/',
        NOW,
      ),
    ).toEqual([])
  })

  it('残り時間通知が無効なら通知計画を作らない', () => {
    const s = settings([GROUP], {
      notificationThresholdMinutes: 5,
      remainingTimeNotificationsEnabled: false,
    })

    expect(
      buildEffectiveRemainingTimeNotificationPlans(
        s,
        s,
        counters({ 'group-a': 57 * 60 }, LOGICAL_DATE),
        {},
        'https://example.com/',
        NOW,
      ),
    ).toEqual([])
  })
})
