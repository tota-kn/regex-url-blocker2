import { describe, expect, it } from 'vitest'
import {
  loadCounters,
  loadGroupPauseState,
  loadSettings,
  loadUsageNotificationHistory,
  parseSettingsExportJson,
  saveCounters,
  saveGroupPauseState,
  saveSettings,
  saveUsageNotificationHistory,
  serializeSettingsExport,
} from '../utils/storage'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import { createEmptyGroup } from './helpers'

describe('loadSettings', () => {
  it('未設定時は DEFAULT を返す', async () => {
    const s = await loadSettings()
    expect(s.global).toEqual(DEFAULT_GLOBAL_SETTINGS)
    expect(s.groups).toEqual([])
  })

  it('groups が array でない場合は [] にフォールバック', async () => {
    await browser.storage.sync.set({ groups: 'not-an-array' })
    const s = await loadSettings()
    expect(s.groups).toEqual([])
  })

  it('global の一部欠損は DEFAULT で穴埋めされる', async () => {
    await browser.storage.sync.set({ global: { redirectUrl: 'https://block.test' } })
    const s = await loadSettings()
    expect(s.global.redirectUrl).toBe('https://block.test')
    expect(s.global.blockAction).toBe(DEFAULT_GLOBAL_SETTINGS.blockAction)
    expect(s.global.dailyResetHour).toBe(DEFAULT_GLOBAL_SETTINGS.dailyResetHour)
    expect(s.global.remainingTimeNotificationsEnabled).toBe(true)
    expect(s.global.notificationThresholdMinutes).toBe(5)
  })

  it('旧形式の notificationThresholdMinutes: 0 は残り時間通知 OFF へ移行される', async () => {
    await browser.storage.sync.set({ global: { notificationThresholdMinutes: 0 } })
    const s = await loadSettings()
    expect(s.global.remainingTimeNotificationsEnabled).toBe(false)
    expect(s.global.notificationThresholdMinutes).toBe(
      DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes,
    )
  })

  it('global の blockAction が不正な場合は DEFAULT で補完される', async () => {
    await browser.storage.sync.set({ global: { blockAction: 'invalid' } })
    const s = await loadSettings()
    expect(s.global.blockAction).toBe(DEFAULT_GLOBAL_SETTINGS.blockAction)
  })

  it('重複した Restrictions は厳しい値へ統合し Block を Redirect より優先する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...createEmptyGroup('Duplicates'),
          restrictions: [
            { type: 'redirect', redirectUrl: 'https://first.test/' },
            { type: 'grace', graceMinutes: 30 },
            { type: 'wait', waitSeconds: 5 },
            { type: 'redirect', redirectUrl: 'https://second.test/' },
            { type: 'grace', graceMinutes: 10 },
            { type: 'wait', waitSeconds: 20 },
            { type: 'block' },
          ],
        },
      ],
    })

    const settings = await loadSettings()

    expect(settings.groups[0].restrictions).toEqual([
      { type: 'block' },
      { type: 'grace', graceMinutes: 10 },
      { type: 'wait', waitSeconds: 20, waitGrantMinutes: 10 },
    ])
  })

  it('Redirect 重複だけなら先頭 URL を保持する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...createEmptyGroup('Redirect duplicates'),
          restrictions: [
            { type: 'redirect', redirectUrl: 'https://first.test/' },
            { type: 'redirect', redirectUrl: 'https://second.test/' },
          ],
        },
      ],
    })

    const settings = await loadSettings()

    expect(settings.groups[0].restrictions).toEqual([
      { type: 'redirect', redirectUrl: 'https://first.test/' },
    ])
  })

  it('既存の Wait で許可期間が未設定なら10分を補完する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...createEmptyGroup('Legacy wait'),
          restrictions: [{ type: 'wait', waitSeconds: 5 }],
        },
      ],
    })

    const settings = await loadSettings()
    expect(settings.groups[0].restrictions).toEqual([
      { type: 'wait', waitSeconds: 5, waitGrantMinutes: 10 },
    ])
  })

  it('旧バージョンで保存された0分の許可期間は10分へ移行する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...createEmptyGroup('Zero grant'),
          restrictions: [{ type: 'wait', waitSeconds: 5, waitGrantMinutes: 0 }],
        },
      ],
    })

    const settings = await loadSettings()
    expect(settings.groups[0].restrictions).toEqual([
      { type: 'wait', waitSeconds: 5, waitGrantMinutes: 10 },
    ])
  })
})

describe('saveSettings', () => {
  it('save → load でラウンドトリップ（分離形式）', async () => {
    const group = {
      ...createEmptyGroup(),
      name: 'Twitter',
      patterns: ['^https?://twitter\\.com'],
      timeWindows: [
        {
          type: 'scheduled' as const,
          condition: {
            type: 'weekly' as const,
            daysOfWeek: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5)[],
          },
          timeRanges: [{ startMinute: 540, endMinute: 1080 }],
        },
      ],
      restrictions: [{ type: 'block' as const }],
    }
    const settings = {
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        blockAction: 'blockedPage' as const,
        redirectUrl: 'https://block.test',
        dailyResetHour: '03:00',
      },
      groups: [group],
    }
    await saveSettings(settings)
    const loaded = await loadSettings()
    expect(loaded).toEqual(settings)
  })

  it('save → load で grace / wait の restriction もラウンドトリップする', async () => {
    const graceGroup = {
      ...createEmptyGroup('Grace'),
      timeWindows: [{ type: 'always' as const }],
      restrictions: [{ type: 'grace' as const, graceMinutes: 15 }],
    }
    const waitGroup = {
      ...createEmptyGroup('Wait'),
      timeWindows: [{ type: 'always' as const }],
      restrictions: [{ type: 'wait' as const, waitSeconds: 30, waitGrantMinutes: 10 }],
    }
    const settings = {
      global: DEFAULT_GLOBAL_SETTINGS,
      groups: [graceGroup, waitGroup],
    }
    await saveSettings(settings)
    const loaded = await loadSettings()
    expect(loaded).toEqual(settings)
  })
})

describe('settings export file', () => {
  it('version と settings を含む JSON に変換する', () => {
    const settings = {
      global: DEFAULT_GLOBAL_SETTINGS,
      groups: [{ ...createEmptyGroup('Exported'), patterns: ['example\\.com'] }],
    }

    expect(JSON.parse(serializeSettingsExport(settings))).toEqual({
      version: 9,
      settings,
    })
  })

  it('valid JSON import を Settings に変換する', () => {
    const settings = {
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        blockAction: 'blockedPage' as const,
        redirectUrl: 'https://block.test',
        dailyResetHour: '03:00',
      },
      groups: [{ ...createEmptyGroup('Imported'), patterns: ['example\\.com'] }],
    }

    expect(parseSettingsExportJson(JSON.stringify({ version: 2, settings }))).toEqual(settings)
  })

  it('v2 import はグローバル block action を各グループへ移行する', () => {
    const imported = parseSettingsExportJson(
      JSON.stringify({
        version: 2,
        settings: {
          global: {
            ...DEFAULT_GLOBAL_SETTINGS,
            blockAction: 'redirect',
            redirectUrl: 'https://legacy-blocked.test',
          },
          groups: [
            {
              id: 'legacy',
              name: 'Legacy',
              mode: 'blacklist',
              patterns: ['example\\.com'],
              dailyRules: [],
            },
          ],
        },
      }),
    )

    expect(imported.groups[0]).toMatchObject({
      blockAction: 'redirect',
      redirectUrl: 'https://legacy-blocked.test',
    })
  })

  it('v9 export/import はグループ別 block action と disabled、分離した制限を保持する', () => {
    const settings = {
      global: DEFAULT_GLOBAL_SETTINGS,
      groups: [
        {
          ...createEmptyGroup('Imported'),
          disabled: true,
          blockAction: 'redirect' as const,
          redirectUrl: 'https://group-blocked.test',
          timeWindows: [{ type: 'always' as const }],
          restrictions: [{ type: 'grace' as const, graceMinutes: 20 }],
        },
      ],
    }

    expect(parseSettingsExportJson(serializeSettingsExport(settings))).toEqual(settings)
  })

  it('v3 import は disabled 欠損を false で補完する', () => {
    const imported = parseSettingsExportJson(
      JSON.stringify({
        version: 3,
        settings: {
          global: DEFAULT_GLOBAL_SETTINGS,
          groups: [
            {
              id: 'v3',
              name: 'V3',
              mode: 'blacklist',
              lockMode: false,
              patterns: ['example\\.com'],
              blockAction: 'blockedPage',
              redirectUrl: 'https://example.com',
              dailyRules: [],
            },
          ],
        },
      }),
    )

    expect(imported.groups[0].disabled).toBe(false)
  })

  it('v4 import は dailyRules を単一 restriction（grace）へ変換して受け入れる', () => {
    const imported = parseSettingsExportJson(
      JSON.stringify({
        version: 4,
        settings: {
          global: DEFAULT_GLOBAL_SETTINGS,
          groups: [
            {
              id: 'v4',
              name: 'V4',
              mode: 'blacklist',
              disabled: false,
              lockMode: false,
              patterns: ['example\\.com'],
              blockAction: 'blockedPage',
              redirectUrl: 'https://example.com',
              dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                blockedTimeRanges: [],
                dailyLimitMinutes: 15,
              })),
            },
          ],
        },
      }),
    )

    expect(imported.groups[0].timeWindows).toEqual([{ type: 'always' }])
    expect(imported.groups[0].restrictions?.[0]).toMatchObject({
      type: 'grace',
      graceMinutes: 15,
    })
  })

  it('v6 import は複数 scheduleRules を block > grace > wait の複数 restriction rules へ変換する', () => {
    const imported = parseSettingsExportJson(
      JSON.stringify({
        version: 6,
        settings: {
          global: DEFAULT_GLOBAL_SETTINGS,
          groups: [
            {
              id: 'v6-mixed',
              name: 'V6 Mixed',
              mode: 'blacklist',
              disabled: false,
              lockMode: false,
              patterns: ['example\\.com'],
              blockAction: 'blockedPage',
              redirectUrl: 'https://example.com',
              scheduleRules: [
                {
                  id: 'wait-rule',
                  condition: { type: 'daily' },
                  blockedTimeRanges: [],
                  dailyLimitMinutes: undefined,
                  delaySeconds: 30,
                },
                {
                  id: 'grace-rule',
                  condition: { type: 'daily' },
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 20,
                },
                {
                  id: 'block-rule',
                  condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
                  blockedTimeRanges: [{ startMinute: 540, endMinute: 1080 }],
                },
              ],
            },
          ],
        },
      }),
    )

    expect(imported.groups[0].timeWindows?.[0]).toMatchObject({
      type: 'scheduled',
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      timeRanges: [{ startMinute: 540, endMinute: 1080 }],
    })
    expect(imported.groups[0].restrictions?.[1]).toMatchObject({
      type: 'grace',
      graceMinutes: 20,
    })
    expect(imported.groups[0].restrictions?.[2]).toMatchObject({
      type: 'wait',
      waitSeconds: 30,
    })
  })

  it('v6 import は block 候補が無ければ grace、wait の順で複数 restriction rules へ変換する', () => {
    const imported = parseSettingsExportJson(
      JSON.stringify({
        version: 6,
        settings: {
          global: DEFAULT_GLOBAL_SETTINGS,
          groups: [
            {
              id: 'v6-grace-wait',
              name: 'V6 Grace Wait',
              mode: 'blacklist',
              disabled: false,
              lockMode: false,
              patterns: ['example\\.com'],
              blockAction: 'blockedPage',
              redirectUrl: 'https://example.com',
              scheduleRules: [
                {
                  id: 'wait-rule',
                  condition: { type: 'daily' },
                  blockedTimeRanges: [],
                  dailyLimitMinutes: undefined,
                  delaySeconds: 30,
                },
                {
                  id: 'grace-rule',
                  condition: { type: 'daily' },
                  blockedTimeRanges: [],
                  dailyLimitMinutes: 20,
                },
              ],
            },
          ],
        },
      }),
    )

    expect(imported.groups[0].restrictions?.[0]).toMatchObject({
      type: 'grace',
      graceMinutes: 20,
    })
    expect(imported.groups[0].restrictions?.[1]).toMatchObject({
      type: 'wait',
      waitSeconds: 30,
    })
  })

  it('通知設定をエクスポート/インポートでラウンドトリップする', () => {
    const settings = {
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        remainingTimeNotificationsEnabled: false,
        notificationThresholdMinutes: 12,
      },
      groups: [],
    }

    expect(parseSettingsExportJson(serializeSettingsExport(settings))).toEqual(settings)
  })

  it('mode 欠損の互換データは blacklist で補完する', () => {
    const imported = parseSettingsExportJson(
      JSON.stringify({
        version: 2,
        settings: {
          global: DEFAULT_GLOBAL_SETTINGS,
          groups: [{ id: 'old', name: 'Old', patterns: ['example\\.com'], dailyRules: [] }],
        },
      }),
    )

    expect(imported.groups[0].mode).toBe('blacklist')
    expect(imported.groups[0].disabled).toBe(false)
    expect(imported.groups[0].lockMode).toBe(false)
  })

  it('不正 JSON は reject する', () => {
    expect(() => parseSettingsExportJson('{')).toThrow('Invalid JSON')
  })

  it('version 不一致は reject する', () => {
    expect(() =>
      parseSettingsExportJson(
        JSON.stringify({ version: 1, settings: { global: DEFAULT_GLOBAL_SETTINGS, groups: [] } }),
      ),
    ).toThrow('Unsupported settings file version')
  })

  it('settings 欠損は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({ version: 2 }))).toThrow(
      'Settings file is missing settings',
    )
  })

  it('groups 欠損は reject する', () => {
    expect(() =>
      parseSettingsExportJson(
        JSON.stringify({ version: 2, settings: { global: DEFAULT_GLOBAL_SETTINGS } }),
      ),
    ).toThrow('Settings file is missing groups')
  })

  it('バリデーションエラーがある設定は reject する', () => {
    expect(() =>
      parseSettingsExportJson(
        JSON.stringify({
          version: 2,
          settings: {
            global: { ...DEFAULT_GLOBAL_SETTINGS, dailyResetHour: '99:99' },
            groups: [],
          },
        }),
      ),
    ).toThrow('Settings file contains invalid settings')
  })
})

describe('loadSettings のマイグレーション', () => {
  it('groups の mode 欠損は blacklist で補完される', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'x', name: 'old', patterns: [], dailyRules: [] }],
    })
    const s = await loadSettings()
    expect(s.groups[0].mode).toBe('blacklist')
    expect(s.groups[0].disabled).toBe(false)
    expect(s.groups[0].lockMode).toBe(false)
  })

  it('旧 storage データのグループ別ブロック先はグローバル設定から補完される', async () => {
    await browser.storage.sync.set({
      global: { blockAction: 'redirect', redirectUrl: 'https://legacy-blocked.test' },
      groups: [{ id: 'x', name: 'old', patterns: [], dailyRules: [] }],
    })
    const s = await loadSettings()
    expect(s.groups[0].blockAction).toBe('redirect')
    expect(s.groups[0].redirectUrl).toBe('https://legacy-blocked.test')
  })

  it('グローバル設定もない旧 storage データは blocked page を補完する', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'x', name: 'old', patterns: [], dailyRules: [] }],
    })
    const s = await loadSettings()
    expect(s.groups[0].blockAction).toBe('blockedPage')
    expect(s.groups[0].redirectUrl).toBe('https://example.com')
  })

  it('whitelist は保持される', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'y', name: 'wl', mode: 'whitelist', patterns: [], dailyRules: [] }],
    })
    const s = await loadSettings()
    expect(s.groups[0].mode).toBe('whitelist')
  })

  it('旧 dailyRules は同一内容の曜日をまとめ、block 候補があれば block 制限へ変換する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          id: 'legacy-rules',
          name: 'legacy',
          mode: 'blacklist',
          patterns: [],
          dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            blockedTimeRanges:
              dayOfWeek >= 1 && dayOfWeek <= 5 ? [{ startMinute: 540, endMinute: 1080 }] : [],
            dailyLimitMinutes: 30,
          })),
        },
      ],
    })
    const s = await loadSettings()

    expect(s.groups[0].timeWindows?.[0]).toMatchObject({
      type: 'scheduled',
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      timeRanges: [{ startMinute: 540, endMinute: 1080 }],
    })
    expect(s.groups[0].restrictions?.[0]).toEqual({
      type: 'block',
      graceMinutes: undefined,
      waitSeconds: undefined,
    })
  })

  it('旧 dailyRules が全曜日同一で上限のみの場合は daily grace 制限1件へ変換する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          id: 'legacy-daily',
          name: 'legacy',
          mode: 'blacklist',
          patterns: [],
          dailyRules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            blockedTimeRanges: [],
            dailyLimitMinutes: 15,
          })),
        },
      ],
    })
    const s = await loadSettings()

    expect(s.groups[0].timeWindows).toEqual([{ type: 'always' }])
    expect(s.groups[0].restrictions?.[0]).toMatchObject({ type: 'grace', graceMinutes: 15 })
  })

  it('scheduleRules の condition.type が未知の要素は破棄され、残りのルールから集約される', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          id: 'mixed',
          name: 'mixed',
          mode: 'blacklist',
          patterns: [],
          scheduleRules: [
            {
              id: 'ok',
              condition: { type: 'daily' },
              blockedTimeRanges: [],
              dailyLimitMinutes: 10,
            },
            {
              id: 'broken',
              condition: { type: 'cron', expression: '* * * * *' },
              blockedTimeRanges: [],
              dailyLimitMinutes: 5,
            },
          ],
        },
      ],
    })
    const s = await loadSettings()

    expect(s.groups[0].timeWindows).toEqual([{ type: 'always' }])
    expect(s.groups[0].restrictions?.[0]).toMatchObject({ type: 'grace', graceMinutes: 10 })
  })

  it('旧 schedules / blockedTimeSlots / timeLimits フィールドは破棄され制限なしで初期化される', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          id: 'z',
          name: 'old',
          mode: 'blacklist',
          patterns: [],
          schedules: [{ daysOfWeek: [], start: '09:00', end: '18:00', dailyTimeLimitMinutes: 30 }],
          blockedTimeSlots: [{ daysOfWeek: [], start: '09:00', end: '18:00' }],
          timeLimits: [{ daysOfWeek: [], dailyMinutes: 30 }],
        },
      ],
    })
    const s = await loadSettings()
    expect(s.groups[0].timeWindows).toEqual([])
    expect(s.groups[0].restrictions).toEqual([])
    expect((s.groups[0] as unknown as Record<string, unknown>).schedules).toBeUndefined()
    expect((s.groups[0] as unknown as Record<string, unknown>).blockedTimeSlots).toBeUndefined()
    expect((s.groups[0] as unknown as Record<string, unknown>).timeLimits).toBeUndefined()
    expect((s.groups[0] as unknown as Record<string, unknown>).dailyRules).toBeUndefined()
    expect((s.groups[0] as unknown as Record<string, unknown>).scheduleRules).toBeUndefined()
  })
})

describe('counter storage', () => {
  it('未設定時は空カウンタを返す', async () => {
    expect(await loadCounters()).toEqual({ counters: {} })
  })

  it('save → load でカウンタをラウンドトリップする', async () => {
    const counters = {
      counters: {
        group1: { logicalDate: '2026-05-06', consumedSec: 10 },
      },
    }
    await saveCounters(counters)
    expect(await loadCounters()).toEqual(counters)
  })

  it('不正なカウンタ値は読み込み時に除外する', async () => {
    await browser.storage.local.set({
      counters: {
        ok: { logicalDate: '2026-05-06', consumedSec: 10.9 },
        badDate: { logicalDate: 123, consumedSec: 10 },
        badSec: { logicalDate: '2026-05-06', consumedSec: 'x' },
      },
    })
    expect(await loadCounters()).toEqual({
      counters: {
        ok: { logicalDate: '2026-05-06', consumedSec: 10 },
      },
    })
  })
})

describe('group pause state storage', () => {
  it('未設定時は空状態を返す', async () => {
    expect(await loadGroupPauseState()).toEqual({ groupPauseState: {} })
  })

  it('save → load で一時停止状態をラウンドトリップする', async () => {
    const state = {
      groupPauseState: {
        group1: { waitingUntil: Date.now() + 60_000, pausedUntil: Date.now() + 600_000 },
      },
    }
    await saveGroupPauseState(state)
    expect(await loadGroupPauseState()).toEqual(state)
  })

  it('不正値、期限切れ pause、削除済み group id は読み込み時に除外する', async () => {
    const now = 1_000_000
    await browser.storage.local.set({
      groupPauseState: {
        ready: { waitingUntil: now - 1 },
        paused: { pausedUntil: now + 600_000 },
        expiredPause: { pausedUntil: now - 1 },
        badWaiting: { waitingUntil: -1 },
        badPause: { pausedUntil: 'x' },
        removed: { pausedUntil: now + 600_000 },
        badEntry: 'x',
      },
    })

    expect(
      await loadGroupPauseState(['ready', 'paused', 'expiredPause', 'badWaiting', 'badPause'], now),
    ).toEqual({
      groupPauseState: {
        ready: { waitingUntil: now - 1 },
        paused: { pausedUntil: now + 600_000 },
      },
    })
  })

  it('valid group id に含まれる active-only group の一時停止状態は保持する', async () => {
    const now = 1_000_000
    await browser.storage.local.set({
      groupPauseState: {
        activeOnly: { pausedUntil: now + 600_000 },
      },
    })

    expect(await loadGroupPauseState(['saved', 'activeOnly'], now)).toEqual({
      groupPauseState: {
        activeOnly: { pausedUntil: now + 600_000 },
      },
    })
  })
})

describe('usage notification history storage', () => {
  it('未設定時は空履歴を返す', async () => {
    expect(await loadUsageNotificationHistory()).toEqual({ usageNotificationHistory: {} })
  })

  it('save → load で通知履歴をラウンドトリップする', async () => {
    const history = {
      usageNotificationHistory: {
        group1: { logicalDate: '2026-05-06' },
      },
    }
    await saveUsageNotificationHistory(history)
    expect(await loadUsageNotificationHistory()).toEqual(history)
  })

  it('不正な通知履歴値は読み込み時に除外する', async () => {
    await browser.storage.local.set({
      usageNotificationHistory: {
        ok: { logicalDate: '2026-05-06' },
        badDate: { logicalDate: 123 },
        badEntry: 'x',
      },
    })
    expect(await loadUsageNotificationHistory()).toEqual({
      usageNotificationHistory: {
        ok: { logicalDate: '2026-05-06' },
      },
    })
  })
})
