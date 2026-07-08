import { describe, expect, it } from 'vitest'
import {
  createEffectiveSettingsState,
  hasPendingEffectiveSettings,
  mergeImmediateRestrictions,
  reconcileEffectiveSettings,
} from '../utils/effectiveSettings'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import type { Group, Settings } from '../utils/types'
import { dailyScheduleRules, weeklyScheduleRules } from './helpers'

/**
 * テスト用グループを生成する。
 */
function group(overrides: Partial<Group> = {}): Group {
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
 * テスト用設定を生成する。
 */
function settings(groups: Group[], dailyResetHour = '00:00'): Settings {
  return {
    global: {
      ...DEFAULT_GLOBAL_SETTINGS,
      blockAction: 'redirect',
      redirectUrl: 'https://blocked.test/',
      dailyResetHour,
    },
    groups,
  }
}

describe('effective settings', () => {
  it('Lock Mode OFF の group は編集が即時に有効設定へ反映される', () => {
    const active = settings([group({
      patterns: ['example\\.com'],
      scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 30 }),
    })])
    const preferred = settings([group({
      patterns: ['example\\.com', 'news\\.example'],
      scheduleRules: dailyScheduleRules({
        blockedTimeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }],
        dailyLimitMinutes: 10,
      }),
    })])

    expect(mergeImmediateRestrictions(active, preferred)).toEqual(preferred)
  })

  it('Lock Mode OFF の group は削除が即時に有効設定へ反映される', () => {
    const active = settings([group({ id: 'deleted' }), group({ id: 'kept' })])
    const preferred = settings([group({ id: 'kept' })])

    expect(mergeImmediateRestrictions(active, preferred).groups.map(g => g.id)).toEqual(['kept'])
  })

  it('Lock Mode ON の group は厳格化も緩和も即時に有効設定へ反映されない', () => {
    const active = settings([group({
      lockMode: true,
      patterns: ['example\\.com', 'news\\.example'],
      scheduleRules: dailyScheduleRules({
        blockedTimeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }],
        dailyLimitMinutes: 10,
      }),
    })], '03:00')
    const preferred = settings([group({
      patterns: ['example\\.com'],
      scheduleRules: dailyScheduleRules({ dailyLimitMinutes: 30 }),
    })], '03:00')

    const state = reconcileEffectiveSettings(
      preferred,
      createEffectiveSettingsState(active, new Date('2026-05-06T12:00:00+09:00')),
      new Date('2026-05-06T13:00:00+09:00'),
    )

    expect(state.effectiveSettings.groups[0].patterns).toEqual(['example\\.com', 'news\\.example'])
    expect(state.effectiveSettings.groups[0].scheduleRules[0].blockedTimeRanges).toEqual([{ startMinute: 540, endMinute: 1020 }])
    expect(state.effectiveSettings.groups[0].scheduleRules[0].dailyLimitMinutes).toBe(10)

    const strictPreferred = settings([group({
      lockMode: true,
      patterns: ['example\\.com', 'news\\.example', 'strict\\.example'],
      scheduleRules: dailyScheduleRules({
        blockedTimeRanges: [{ startMinute: 0, endMinute: 0 }],
        dailyLimitMinutes: 1,
      }),
    })], '03:00')

    expect(mergeImmediateRestrictions(active, strictPreferred).groups[0]).toEqual(active.groups[0])
  })

  it('Lock Mode group がある場合、dailyResetHour 変更は保存・reconcile 後も反映されない', () => {
    const active = settings([group({ lockMode: true })], '03:00')
    const preferred = settings([group({ lockMode: true })], '05:00')

    const state = reconcileEffectiveSettings(
      preferred,
      createEffectiveSettingsState(active, new Date('2026-05-06T12:00:00+09:00')),
      new Date('2026-05-06T13:00:00+09:00'),
    )

    expect(state.effectiveSettings.global.dailyResetHour).toBe('03:00')
  })

  it('Lock Mode group がない場合、dailyResetHour 変更は即時に反映される', () => {
    const active = settings([group()], '03:00')
    const preferred = settings([group()], '05:00')

    const state = reconcileEffectiveSettings(
      preferred,
      createEffectiveSettingsState(active, new Date('2026-05-06T12:00:00+09:00')),
      new Date('2026-05-06T13:00:00+09:00'),
    )

    expect(state.effectiveSettings.global.dailyResetHour).toBe('05:00')
  })

  it('残り時間通知 ON/OFF は即時に有効設定へ反映される', () => {
    const active = settings([group()], '03:00')
    const basePreferred = settings([group()], '03:00')
    const preferred = {
      ...basePreferred,
      global: {
        ...basePreferred.global,
        remainingTimeNotificationsEnabled: false,
      },
    }

    expect(mergeImmediateRestrictions(active, preferred).global.remainingTimeNotificationsEnabled).toBe(false)
  })

  it('Lock Mode ON の group 削除は次回 reset まで effective に残る', () => {
    const active = settings([group({ lockMode: true })], '03:00')
    const preferred = settings([], '03:00')

    expect(mergeImmediateRestrictions(active, preferred).groups.map(g => g.id)).toEqual(['g1'])
  })

  it('Lock Mode ON から OFF に変更しても次回 reset までは effective 側で ON のまま維持される', () => {
    const active = settings([group({ lockMode: true, patterns: ['old\\.test'] })], '03:00')
    const preferred = settings([group({ lockMode: false, patterns: ['new\\.test'] })], '03:00')

    expect(mergeImmediateRestrictions(active, preferred).groups[0]).toEqual(active.groups[0])
  })

  it('次回 reset 到達時に Lock Mode group の保留変更と削除が preferred 通りに反映される', () => {
    const active = settings([
      group({ id: 'changed', lockMode: true }),
      group({ id: 'deleted', lockMode: true }),
    ], '03:00')
    const preferred = settings([group({
      id: 'changed',
      lockMode: false,
      scheduleRules: weeklyScheduleRules([3], { dailyLimitMinutes: 60 }),
    })], '05:00')

    const state = reconcileEffectiveSettings(
      preferred,
      createEffectiveSettingsState(active, new Date('2026-05-06T12:00:00+09:00')),
      new Date('2026-05-07T03:00:00+09:00'),
    )

    expect(state.effectiveSettings).toEqual(preferred)
    expect(state.effectiveSettingsLogicalDate).toBe('2026-05-06')
  })

  it('Lock Mode OFF のグループ変更は pending にしない', () => {
    const effective = settings([group({ patterns: ['old\\.test'] })])
    const preferred = settings([group({ patterns: ['new\\.test'] })])

    expect(hasPendingEffectiveSettings(preferred, effective)).toBe(false)
  })

  it('新規グループ追加だけの変更は翌日待ち差分にしない', () => {
    const effective = settings([group()])
    const preferred = settings([
      group(),
      group({ id: 'g2', name: 'Second group', patterns: ['second\\.test'] }),
    ])

    expect(hasPendingEffectiveSettings(preferred, effective)).toBe(false)
  })

  it('Lock Mode ON の group snapshot と preferred group の差分だけを pending にする', () => {
    const effective = settings([group({
      lockMode: true,
      patterns: ['example\\.com'],
    })])
    const preferred = settings([group({
      lockMode: true,
      patterns: ['example\\.com', 'news\\.example'],
    })])

    expect(hasPendingEffectiveSettings(preferred, effective)).toBe(true)
  })

  it('Lock Mode ON の disabled 変更は次回 reset まで effective 側へ反映されず pending にする', () => {
    const active = settings([group({ lockMode: true, disabled: false })], '03:00')
    const preferred = settings([group({ lockMode: true, disabled: true })], '03:00')

    const merged = mergeImmediateRestrictions(active, preferred)

    expect(merged.groups[0].disabled).toBe(false)
    expect(hasPendingEffectiveSettings(preferred, merged)).toBe(true)
  })

  it('Lock Mode ON の group 削除は pending にする', () => {
    expect(hasPendingEffectiveSettings(settings([]), settings([group({ lockMode: true })]))).toBe(true)
  })
})
