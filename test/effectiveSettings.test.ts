import { describe, expect, it } from 'vitest'
import {
  createEffectiveSettingsState,
  hasPendingEffectiveSettings,
  mergeImmediateRestrictions,
  reconcileEffectiveSettings,
} from '../utils/effectiveSettings'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyDailyRules } from '../utils/defaults'
import type { DailyRule, DayOfWeek, Group, Settings } from '../utils/types'

/**
 * テスト用グループを生成する。
 */
function group(overrides: Partial<Group> = {}): Group {
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
 * すべての曜日へ同じルールを適用した7曜日分のルールを返す。
 */
function allDailyRules(override: Partial<DailyRule>): DailyRule[] {
  return createEmptyDailyRules().map(rule => ({ ...rule, ...override }))
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
  it('厳格化は即時に有効設定へ反映される', () => {
    const active = settings([group({
      patterns: ['example\\.com'],
      dailyRules: allDailyRules({ dailyLimitMinutes: 30 }),
    })])
    const preferred = settings([group({
      patterns: ['example\\.com', 'news\\.example'],
      dailyRules: allDailyRules({
        blockedTimeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }],
        dailyLimitMinutes: 10,
      }),
    })])

    expect(mergeImmediateRestrictions(active, preferred)).toEqual(preferred)
  })

  it('緩和は旧リセット時刻まで保留される', () => {
    const active = settings([group({
      patterns: ['example\\.com', 'news\\.example'],
      dailyRules: allDailyRules({
        blockedTimeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }],
        dailyLimitMinutes: 10,
      }),
    })], '03:00')
    const preferred = settings([group({
      patterns: ['example\\.com'],
      dailyRules: allDailyRules({ dailyLimitMinutes: 30 }),
    })], '03:00')

    const state = reconcileEffectiveSettings(
      preferred,
      createEffectiveSettingsState(active, new Date('2026-05-06T12:00:00+09:00')),
      new Date('2026-05-06T13:00:00+09:00'),
    )

    expect(state.effectiveSettings.groups[0].patterns).toEqual(['example\\.com', 'news\\.example'])
    expect(state.effectiveSettings.groups[0].dailyRules[0].blockedTimeRanges).toEqual([{ startMinute: 540, endMinute: 1020 }])
    expect(state.effectiveSettings.groups[0].dailyRules[0].dailyLimitMinutes).toBe(10)
  })

  it('dailyResetHour 変更は旧リセット時刻まで保留される', () => {
    const active = settings([group()], '03:00')
    const preferred = settings([group()], '05:00')

    const state = reconcileEffectiveSettings(
      preferred,
      createEffectiveSettingsState(active, new Date('2026-05-06T12:00:00+09:00')),
      new Date('2026-05-06T13:00:00+09:00'),
    )

    expect(state.effectiveSettings.global.dailyResetHour).toBe('03:00')
  })

  it('旧リセット時刻到達後、希望設定が有効設定へ昇格する', () => {
    const active = settings([group()], '03:00')
    const preferred = settings([group({
      dailyRules: dailyRule(3, { dailyLimitMinutes: 60 }),
    })], '05:00')

    const state = reconcileEffectiveSettings(
      preferred,
      createEffectiveSettingsState(active, new Date('2026-05-06T12:00:00+09:00')),
      new Date('2026-05-07T03:00:00+09:00'),
    )

    expect(state.effectiveSettings).toEqual(preferred)
    expect(state.effectiveSettingsLogicalDate).toBe('2026-05-06')
  })

  it('希望設定と有効設定の差分有無を正しく判定できる', () => {
    const preferred = settings([group()], '00:00')
    const effective = settings([group()], '03:00')

    expect(hasPendingEffectiveSettings(preferred, preferred)).toBe(false)
    expect(hasPendingEffectiveSettings(preferred, effective)).toBe(true)
  })

  it('グループ削除と whitelist 追加は保留される', () => {
    const active = settings([
      group({ id: 'deleted' }),
      group({ id: 'wl', mode: 'whitelist', patterns: ['allowed\\.test'] }),
    ])
    const preferred = settings([
      group({ id: 'wl', mode: 'whitelist', patterns: ['allowed\\.test', 'extra\\.test'] }),
    ])

    const merged = mergeImmediateRestrictions(active, preferred)

    expect(merged.groups.map(g => g.id)).toEqual(['deleted', 'wl'])
    expect(merged.groups.find(g => g.id === 'wl')?.patterns).toEqual(['allowed\\.test'])
  })
})
