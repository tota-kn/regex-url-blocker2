import { describe, expect, it } from 'vitest'
import {
  createEffectiveSettingsState,
  getPendingEffectiveGroupIds,
  getPendingGroupFieldKeys,
  groupFieldKeys,
  mergeImmediateRestrictions,
  reconcileEffectiveSettings,
  resolveEffectiveGroup,
} from '../utils/effectiveSettings'
import type { Group } from '../utils/types'
import { createEmptyGroup, dailyRule, group, settings, weeklyRule } from './helpers'

describe('effective settings', () => {
  it('Lock Mode OFF の group は編集が即時に有効設定へ反映される', () => {
    const active = settings([
      group({
        patterns: ['example\\.com'],
        ...dailyRule({ kind: 'dailyLimit', minutes: 30 }),
      }),
    ])
    const preferred = settings([
      group({
        patterns: ['example\\.com', 'news\\.example'],
        ...dailyRule(
          { kind: 'block' },
          { timeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }] },
        ),
      }),
    ])

    expect(mergeImmediateRestrictions(active, preferred)).toEqual(preferred)
  })

  it('Lock Mode ON では遷移先も次の rule day まで凍結される', () => {
    const blocked = (url?: string): Pick<Group, 'rules'> => ({
      rules: [
        {
          id: 'r0',
          window: { type: 'always' },
          restriction: { kind: 'block' },
          destination: url ? { type: 'redirect', url } : { type: 'blockedPage' },
        },
      ],
    })
    const active = settings([group({ lockMode: true, ...blocked() })])
    const preferred = settings([
      group({ lockMode: true, name: 'Renamed', ...blocked('https://relaxed.test/') }),
    ])

    const merged = mergeImmediateRestrictions(active, preferred)

    // 表示名は即時反映、遷移先の緩和は凍結する。
    expect(merged.groups[0]?.name).toBe('Renamed')
    expect(merged.groups[0]?.rules[0]?.destination).toEqual({ type: 'blockedPage' })
  })

  it('Lock Mode OFF の group は削除が即時に有効設定へ反映される', () => {
    const active = settings([group({ id: 'deleted' }), group({ id: 'kept' })])
    const preferred = settings([group({ id: 'kept' })])

    expect(mergeImmediateRestrictions(active, preferred).groups.map((g) => g.id)).toEqual(['kept'])
  })

  it('Lock Mode ON の group は rule day 開始時の制限スナップショットを維持する', () => {
    const active = settings(
      [
        group({
          lockMode: true,
          patterns: ['example\\.com', 'news\\.example'],
          ...dailyRule(
            { kind: 'block' },
            { timeRanges: [{ startMinute: 9 * 60, endMinute: 17 * 60 }] },
          ),
        }),
      ],
      '03:00',
    )
    const preferred = settings(
      [
        group({
          patterns: ['example\\.com'],
          ...dailyRule({ kind: 'dailyLimit', minutes: 30 }),
        }),
      ],
      '03:00',
    )

    const state = reconcileEffectiveSettings(
      preferred,
      createEffectiveSettingsState(active, new Date('2026-05-06T12:00:00+09:00')),
      new Date('2026-05-06T13:00:00+09:00'),
    )

    expect(state.effectiveSettings.groups[0].patterns).toEqual(['example\\.com', 'news\\.example'])
    expect(state.effectiveSettings.groups[0].rules[0]?.window).toEqual({
      type: 'scheduled',
      condition: { type: 'daily' },
      timeRanges: [{ startMinute: 540, endMinute: 1020 }],
    })
    expect(state.effectiveSettings.groups[0].rules[0]?.restriction.kind).toBe('block')

    const strictPreferred = settings(
      [
        group({
          lockMode: true,
          patterns: ['example\\.com', 'news\\.example', 'strict\\.example'],
          ...dailyRule({ kind: 'dailyLimit', minutes: 1 }),
        }),
      ],
      '03:00',
    )

    expect(mergeImmediateRestrictions(active, strictPreferred).groups[0]).toEqual(active.groups[0])
  })

  it('Lock Mode ON の group は名前と遷移先だけを即時反映する', () => {
    const active = settings([
      group({
        name: 'Old name',
        lockMode: true,
        patterns: ['old\\.test'],
      }),
    ])
    const preferred = settings([
      group({
        name: 'New name',
        lockMode: true,
        patterns: ['new\\.test'],
      }),
    ])

    expect(mergeImmediateRestrictions(active, preferred).groups[0]).toMatchObject({
      name: 'New name',
      lockMode: true,
      patterns: ['old\\.test'],
    })
  })

  it('同日中に Lock Mode を ON にするとその時点の設定を基準にする', () => {
    const active = settings([group({ lockMode: false, patterns: ['old\\.test'] })])
    const preferred = settings([group({ lockMode: true, patterns: ['new\\.test'] })])

    expect(mergeImmediateRestrictions(active, preferred).groups[0]).toEqual(preferred.groups[0])
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

    expect(
      mergeImmediateRestrictions(active, preferred).global.remainingTimeNotificationsEnabled,
    ).toBe(false)
  })

  it('Lock Mode ON の group 削除は次回 reset まで effective に残る', () => {
    const active = settings([group({ lockMode: true })], '03:00')
    const preferred = settings([], '03:00')

    expect(mergeImmediateRestrictions(active, preferred).groups.map((g) => g.id)).toEqual(['g1'])
  })

  it('Lock Mode ON から OFF に変更しても次回 reset までは effective 側で ON のまま維持される', () => {
    const active = settings([group({ lockMode: true, patterns: ['old\\.test'] })], '03:00')
    const preferred = settings([group({ lockMode: false, patterns: ['new\\.test'] })], '03:00')

    expect(mergeImmediateRestrictions(active, preferred).groups[0]).toEqual(active.groups[0])
  })

  it('次回 reset 到達時に Lock Mode group の保留変更と削除が preferred 通りに反映される', () => {
    const active = settings(
      [group({ id: 'changed', lockMode: true }), group({ id: 'deleted', lockMode: true })],
      '03:00',
    )
    const preferred = settings(
      [
        group({
          id: 'changed',
          lockMode: false,
          ...weeklyRule([3], { kind: 'dailyLimit', minutes: 60 }),
        }),
      ],
      '05:00',
    )

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

    expect(getPendingEffectiveGroupIds(preferred, effective)).toEqual([])
  })

  it('新規グループ追加だけの変更は翌日待ち差分にしない', () => {
    const effective = settings([group()])
    const preferred = settings([
      group(),
      group({ id: 'g2', name: 'Second group', patterns: ['second\\.test'] }),
    ])

    expect(getPendingEffectiveGroupIds(preferred, effective)).toEqual([])
  })

  it('Lock Mode ON の group snapshot と preferred group の差分だけを pending にする', () => {
    const effective = settings([
      group({
        lockMode: true,
        patterns: ['example\\.com'],
      }),
    ])
    const preferred = settings([
      group({
        lockMode: true,
        patterns: ['example\\.com', 'news\\.example'],
      }),
    ])

    expect(getPendingEffectiveGroupIds(preferred, effective)).toEqual(['g1'])
  })

  it('Lock Mode ON の disabled 変更は次回 reset まで effective 側へ反映されず pending にする', () => {
    const active = settings([group({ lockMode: true, disabled: false })], '03:00')
    const preferred = settings([group({ lockMode: true, disabled: true })], '03:00')

    const merged = mergeImmediateRestrictions(active, preferred)

    expect(merged.groups[0].disabled).toBe(false)
    expect(getPendingEffectiveGroupIds(preferred, merged)).toEqual(['g1'])
  })

  it('Lock Mode ON の group 削除は pending にする', () => {
    const effective = settings([group({ lockMode: true })])
    const preferred = settings([])

    expect(getPendingEffectiveGroupIds(preferred, effective)).toEqual(['g1'])
  })
})

describe('effective group resolution', () => {
  it('Group の全フィールドに解決方針が定義されている', () => {
    expect(groupFieldKeys().toSorted()).toEqual(Object.keys(createEmptyGroup()).toSorted())
  })

  it('Lock Mode ON では Pause 待機秒数の短縮が次の rule day まで保留される', () => {
    const baseline = group({ lockMode: true, pauseWaitSeconds: 60 })
    const preferred = group({ lockMode: true, pauseWaitSeconds: 0 })

    expect(resolveEffectiveGroup(baseline, preferred).pauseWaitSeconds).toBe(60)
  })

  it('Lock Mode ON でも Pause 待機秒数の延長は即時に反映される', () => {
    const baseline = group({ lockMode: true, pauseWaitSeconds: 60 })
    const preferred = group({ lockMode: true, pauseWaitSeconds: 120 })

    expect(resolveEffectiveGroup(baseline, preferred).pauseWaitSeconds).toBe(120)
  })

  it('Lock Mode ON では Pause 継続分数の延長が次の rule day まで保留される', () => {
    const baseline = group({ lockMode: true, pauseDurationMinutes: 10 })
    const preferred = group({ lockMode: true, pauseDurationMinutes: 1440 })

    expect(resolveEffectiveGroup(baseline, preferred).pauseDurationMinutes).toBe(10)
  })

  it('Lock Mode ON でも Pause 継続分数の短縮は即時に反映される', () => {
    const baseline = group({ lockMode: true, pauseDurationMinutes: 10 })
    const preferred = group({ lockMode: true, pauseDurationMinutes: 5 })

    expect(resolveEffectiveGroup(baseline, preferred).pauseDurationMinutes).toBe(5)
  })

  it('Pause 設定が未指定なら既定値で補って厳しい方を採る', () => {
    const baseline = group({ lockMode: true })
    const preferred = group({ lockMode: true, pauseWaitSeconds: 0, pauseDurationMinutes: 1440 })

    const resolved = resolveEffectiveGroup(baseline, preferred)

    expect(resolved.pauseWaitSeconds).toBe(60)
    expect(resolved.pauseDurationMinutes).toBe(10)
  })

  it('Lock Mode ON では Pause の禁止は即時、再許可は次の rule day まで保留される', () => {
    const allowedBaseline = group({ lockMode: true, pauseAllowed: true })
    const deniedBaseline = group({ lockMode: true, pauseAllowed: false })

    expect(
      resolveEffectiveGroup(allowedBaseline, group({ lockMode: true, pauseAllowed: false }))
        .pauseAllowed,
    ).toBe(false)
    expect(
      resolveEffectiveGroup(deniedBaseline, group({ lockMode: true, pauseAllowed: true }))
        .pauseAllowed,
    ).toBe(false)
  })

  it('Lock Mode ON では表示名だけが即時に反映され、制限内容は基準側を維持する', () => {
    const baseline = group({ lockMode: true, patterns: ['example\\.com'] })
    const preferred = group({
      lockMode: false,
      name: 'Renamed',
      patterns: ['example\\.com', 'news\\.example'],
    })

    const resolved = resolveEffectiveGroup(baseline, preferred)

    expect(resolved.name).toBe('Renamed')
    expect(resolved.patterns).toEqual(['example\\.com'])
    expect(resolved.lockMode).toBe(true)
  })

  it('基準グループが Lock Mode OFF なら希望グループがそのまま返る', () => {
    const baseline = group({ pauseWaitSeconds: 60 })
    const preferred = group({ name: 'Renamed', pauseWaitSeconds: 0 })

    expect(resolveEffectiveGroup(baseline, preferred)).toEqual(preferred)
  })

  it('希望グループが無ければ基準グループがそのまま返る', () => {
    const baseline = group({ lockMode: true, pauseWaitSeconds: 60 })

    expect(resolveEffectiveGroup(baseline, undefined)).toEqual(baseline)
  })

  it('getPendingGroupFieldKeys は保留中のフィールドだけを返す', () => {
    const baseline = group({
      lockMode: true,
      patterns: ['example\\.com'],
      pauseWaitSeconds: 60,
      pauseDurationMinutes: 10,
    })
    const preferred = group({
      lockMode: true,
      name: 'Renamed',
      patterns: ['example\\.com', 'news\\.example'],
      pauseWaitSeconds: 0,
      pauseDurationMinutes: 1440,
    })

    expect(getPendingGroupFieldKeys(baseline, preferred)).toEqual([
      'patterns',
      'pauseWaitSeconds',
      'pauseDurationMinutes',
    ])
  })

  it('getPendingGroupFieldKeys は Lock Mode の解除自体も保留として返す', () => {
    const baseline = group({ lockMode: true })
    const preferred = group({ lockMode: false })

    expect(getPendingGroupFieldKeys(baseline, preferred)).toEqual(['lockMode'])
  })

  it('基準グループが Lock Mode OFF なら保留フィールドは無い', () => {
    const baseline = group({ pauseWaitSeconds: 60 })
    const preferred = group({ pauseWaitSeconds: 0 })

    expect(getPendingGroupFieldKeys(baseline, preferred)).toEqual([])
  })

  it('強化した Pause 設定は基準スナップショットへ蓄積せず同じ rule day 内で元へ戻せる', () => {
    const active = settings([group({ lockMode: true, pauseWaitSeconds: 60 })])
    const strengthened = settings([group({ lockMode: true, pauseWaitSeconds: 120 })])

    const merged = mergeImmediateRestrictions(active, strengthened)
    expect(merged.groups[0].pauseWaitSeconds).toBe(60)

    const restored = settings([group({ lockMode: true, pauseWaitSeconds: 60 })])
    expect(resolveEffectiveGroup(merged.groups[0], restored.groups[0]).pauseWaitSeconds).toBe(60)
  })
})
