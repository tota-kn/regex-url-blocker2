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

/** `rules` を持たない旧フォーマットのグループ fixture を作る。 */
function legacyGroup(name: string): Record<string, unknown> {
  const { rules: _rules, ...rest } = createEmptyGroup(name)
  return rest
}

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
    await browser.storage.sync.set({ global: { dailyResetHour: '05:00' } })
    const s = await loadSettings()
    expect(s.global.dailyResetHour).toBe('05:00')
    expect(s.global.remainingTimeNotificationsEnabled).toBe(true)
    expect(s.global.notificationThresholdMinutes).toBe(5)
    expect(s.global.theme).toBe('auto')
  })

  it('theme は既知の値だけを保持し、不正値は auto に戻す', async () => {
    await browser.storage.sync.set({ global: { theme: 'dark' } })
    expect((await loadSettings()).global.theme).toBe('dark')

    await browser.storage.sync.set({ global: { theme: 'sepia' } })
    expect((await loadSettings()).global.theme).toBe('auto')
  })

  it('旧形式の notificationThresholdMinutes: 0 は残り時間通知 OFF へ移行される', async () => {
    await browser.storage.sync.set({ global: { notificationThresholdMinutes: 0 } })
    const s = await loadSettings()
    expect(s.global.remainingTimeNotificationsEnabled).toBe(false)
    expect(s.global.notificationThresholdMinutes).toBe(
      DEFAULT_GLOBAL_SETTINGS.notificationThresholdMinutes,
    )
  })

  it('廃止された global の blockAction / redirectUrl は保存値から取り除かれる', async () => {
    await browser.storage.sync.set({
      global: { blockAction: 'redirect', redirectUrl: 'https://legacy.test' },
    })
    const s = await loadSettings()
    expect((s.global as unknown as Record<string, unknown>).blockAction).toBeUndefined()
    expect((s.global as unknown as Record<string, unknown>).redirectUrl).toBeUndefined()
  })

  it('重複した旧 Restrictions は厳しい値へ統合し Block を Redirect より優先して移行する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...legacyGroup('Duplicates'),
          timeWindows: [{ type: 'always' }],
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

    expect(settings.groups[0].rules.map((rule) => rule.restriction)).toEqual([
      { kind: 'block' },
      { kind: 'dailyLimit', minutes: 10 },
      { kind: 'wait', seconds: 20, grantMinutes: 10 },
    ])
  })

  it('旧 Redirect 重複は先頭 URL を遷移先に持つ Block ルールへ移行する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...legacyGroup('Redirect duplicates'),
          timeWindows: [{ type: 'always' }],
          restrictions: [
            { type: 'redirect', redirectUrl: 'https://first.test/' },
            { type: 'redirect', redirectUrl: 'https://second.test/' },
          ],
        },
      ],
    })

    const settings = await loadSettings()

    expect(settings.groups[0].rules).toHaveLength(1)
    expect(settings.groups[0].rules[0]?.restriction).toEqual({ kind: 'block' })
    expect(settings.groups[0].rules[0]?.destination).toEqual({
      type: 'redirect',
      url: 'https://first.test/',
    })
  })

  it('既存の Wait で許可期間が未設定なら10分を補完する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...legacyGroup('Legacy wait'),
          timeWindows: [{ type: 'always' }],
          restrictions: [{ type: 'wait', waitSeconds: 5 }],
        },
      ],
    })

    const settings = await loadSettings()
    expect(settings.groups[0].rules[0]?.restriction).toEqual({
      kind: 'wait',
      seconds: 5,
      grantMinutes: 10,
    })
  })

  it('旧バージョンで保存された0分の許可期間は10分へ移行する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...legacyGroup('Zero grant'),
          timeWindows: [{ type: 'always' }],
          restrictions: [{ type: 'wait', waitSeconds: 5, waitGrantMinutes: 0 }],
        },
      ],
    })

    const settings = await loadSettings()
    expect(settings.groups[0].rules[0]?.restriction).toEqual({
      kind: 'wait',
      seconds: 5,
      grantMinutes: 10,
    })
  })

  it('廃止した sessionLimit ルールは読み替えずに黙って捨てる', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...createEmptyGroup('Session limit'),
          rules: [
            {
              id: 'r1',
              window: { type: 'always' },
              restriction: { kind: 'sessionLimit', sessionMinutes: 10, breakMinutes: 30 },
              destination: { type: 'blockedPage' },
            },
            {
              id: 'r2',
              window: { type: 'always' },
              restriction: { kind: 'dailyLimit', minutes: 30 },
              destination: { type: 'blockedPage' },
            },
          ],
        },
      ],
    })

    const settings = await loadSettings()
    expect(settings.groups[0].rules).toHaveLength(1)
    expect(settings.groups[0].rules[0]?.restriction).toEqual({ kind: 'dailyLimit', minutes: 30 })
  })

  it('旧フォーマットの sessionLimit 制限も移行せず捨てる', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...legacyGroup('Legacy session limit'),
          timeWindows: [{ type: 'always' }],
          restrictions: [
            { type: 'sessionLimit', sessionMinutes: 10, breakMinutes: 30 },
            { type: 'grace', graceMinutes: 45 },
          ],
        },
      ],
    })

    const settings = await loadSettings()
    expect(settings.groups[0].rules.map((rule) => rule.restriction)).toEqual([
      { kind: 'dailyLimit', minutes: 45 },
    ])
  })
})

describe('saveSettings', () => {
  it('save → load でラウンドトリップ（Rule 形式）', async () => {
    const group = {
      ...createEmptyGroup(),
      name: 'Twitter',
      patterns: ['^https?://twitter\\.com'],
      rules: [
        {
          id: 'r0',
          window: {
            type: 'scheduled' as const,
            condition: {
              type: 'weekly' as const,
              daysOfWeek: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5)[],
            },
            timeRanges: [{ startMinute: 540, endMinute: 1080 }],
          },
          restriction: { kind: 'block' as const },
          destination: { type: 'blockedPage' as const },
        },
      ],
    }
    const settings = {
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        dailyResetHour: '03:00',
      },
      groups: [group],
    }
    await saveSettings(settings)
    const loaded = await loadSettings()
    expect(loaded).toEqual(settings)
  })

  it('旧バージョンで保存された0分の Daily limit は Block へ移行する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          ...createEmptyGroup('Zero daily limit'),
          rules: [
            {
              id: 'r0',
              window: { type: 'always' },
              restriction: { kind: 'dailyLimit', minutes: 0 },
              destination: { type: 'blockedPage' },
            },
          ],
        },
      ],
    })

    const settings = await loadSettings()
    expect(settings.groups[0].rules[0]?.restriction).toEqual({ kind: 'block' })
    expect(settings.groups[0].rules[0]?.destination).toEqual({ type: 'blockedPage' })
  })

  it('save → load で Daily limit / Wait のルールもラウンドトリップする', async () => {
    const graceGroup = {
      ...createEmptyGroup('Grace'),
      rules: [
        {
          id: 'r0',
          window: { type: 'always' as const },
          restriction: { kind: 'dailyLimit' as const, minutes: 15 },
          destination: { type: 'blockedPage' as const },
        },
      ],
    }
    const waitGroup = {
      ...createEmptyGroup('Wait'),
      rules: [
        {
          id: 'r0',
          window: { type: 'always' as const },
          restriction: { kind: 'wait' as const, seconds: 30, grantMinutes: 10 },
        },
      ],
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
      version: 15,
      settings,
    })
    expect(serializeSettingsExport(settings)).not.toContain('"mode"')
  })

  it('valid JSON import を Settings に変換する', () => {
    const settings = {
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
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

    expect(imported.groups[0]).toMatchObject({})
  })

  it('v12 export/import は Pause 設定を含むグループ別設定を保持する', () => {
    const settings = {
      global: DEFAULT_GLOBAL_SETTINGS,
      groups: [
        {
          ...createEmptyGroup('Imported'),
          pauseWaitSeconds: 0,
          pauseDurationMinutes: 25,
          disabled: true,
          rules: [
            {
              id: 'r0',
              window: { type: 'always' as const },
              restriction: { kind: 'dailyLimit' as const, minutes: 20 },
              destination: { type: 'blockedPage' as const },
            },
          ],
        },
      ],
    }

    expect(parseSettingsExportJson(serializeSettingsExport(settings))).toEqual(settings)
  })

  it('pauseAllowed 欠損は false で補完し、明示値はそのまま保持する', () => {
    const build = (pauseAllowed?: boolean) =>
      JSON.stringify({
        version: 11,
        settings: {
          global: DEFAULT_GLOBAL_SETTINGS,
          groups: [
            {
              ...createEmptyGroup('Imported'),
              pauseAllowed,
              timeWindows: [{ type: 'always' }],
              restrictions: [{ type: 'block' }],
            },
          ],
        },
      })

    expect(parseSettingsExportJson(build()).groups[0].pauseAllowed).toBe(false)
    expect(parseSettingsExportJson(build(true)).groups[0].pauseAllowed).toBe(true)
    expect(parseSettingsExportJson(build(false)).groups[0].pauseAllowed).toBe(false)
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

    expect(imported.groups[0].rules[0]?.window).toEqual({ type: 'always' })
    expect(imported.groups[0].rules[0]?.restriction).toEqual({ kind: 'dailyLimit', minutes: 15 })
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

  it('テーマ設定をエクスポート/インポートでラウンドトリップする', () => {
    const settings = {
      global: { ...DEFAULT_GLOBAL_SETTINGS, theme: 'dark' as const },
      groups: [],
    }

    expect(parseSettingsExportJson(serializeSettingsExport(settings))).toEqual(settings)
  })

  it('mode 欠損の互換データを通常グループとして読み込む', () => {
    const imported = parseSettingsExportJson(
      JSON.stringify({
        version: 2,
        settings: {
          global: DEFAULT_GLOBAL_SETTINGS,
          groups: [{ id: 'old', name: 'Old', patterns: ['example\\.com'], dailyRules: [] }],
        },
      }),
    )

    expect(imported.groups[0]).not.toHaveProperty('mode')
    expect(imported.groups[0].disabled).toBe(false)
    expect(imported.groups[0].lockMode).toBe(false)
  })

  it('旧 whitelist グループの import は安全のため無効化する', () => {
    const imported = parseSettingsExportJson(
      JSON.stringify({
        version: 14,
        settings: {
          global: DEFAULT_GLOBAL_SETTINGS,
          groups: [
            {
              ...createEmptyGroup('Legacy whitelist'),
              mode: 'whitelist',
              disabled: false,
            },
          ],
        },
      }),
    )

    expect(imported.groups[0]).not.toHaveProperty('mode')
    expect(imported.groups[0].disabled).toBe(true)
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

  it('未リリースの中間バージョン（v5〜v10）は reject する', () => {
    for (const version of [5, 6, 7, 8, 9, 10]) {
      expect(() =>
        parseSettingsExportJson(
          JSON.stringify({ version, settings: { global: DEFAULT_GLOBAL_SETTINGS, groups: [] } }),
        ),
      ).toThrow('Unsupported settings file version')
    }
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
  it('groups の mode 欠損は通常グループとして読み込まれる', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'x', name: 'old', patterns: [], dailyRules: [] }],
    })
    const s = await loadSettings()
    expect(s.groups[0]).not.toHaveProperty('mode')
    expect(s.groups[0].disabled).toBe(false)
    expect(s.groups[0].lockMode).toBe(false)
  })

  it('旧 storage データの遷移先はグローバル設定からルールへ畳み込まれる', async () => {
    await browser.storage.sync.set({
      global: { blockAction: 'redirect', redirectUrl: 'https://legacy-blocked.test' },
      groups: [
        {
          id: 'x',
          name: 'old',
          patterns: [],
          timeWindows: [{ type: 'always' }],
          restrictions: [{ type: 'block' }],
        },
      ],
    })
    const s = await loadSettings()
    expect(s.groups[0].rules[0]?.destination).toEqual({
      type: 'redirect',
      url: 'https://legacy-blocked.test',
    })
  })

  it('グループ別 blockAction はグローバル設定より優先される', async () => {
    await browser.storage.sync.set({
      global: { blockAction: 'redirect', redirectUrl: 'https://global.test' },
      groups: [
        {
          id: 'x',
          name: 'old',
          patterns: [],
          blockAction: 'redirect',
          redirectUrl: 'https://group.test',
          timeWindows: [{ type: 'always' }],
          restrictions: [{ type: 'block' }],
        },
      ],
    })
    const s = await loadSettings()
    expect(s.groups[0].rules[0]?.destination).toEqual({
      type: 'redirect',
      url: 'https://group.test',
    })
  })

  it('グループが blockedPage を明示していればグローバルの redirect に上書きされない', async () => {
    await browser.storage.sync.set({
      global: { blockAction: 'redirect', redirectUrl: 'https://global.test' },
      groups: [
        {
          id: 'x',
          name: 'old',
          patterns: [],
          blockAction: 'blockedPage',
          redirectUrl: 'https://unused.test',
          timeWindows: [{ type: 'always' }],
          restrictions: [{ type: 'block' }],
        },
      ],
    })
    const s = await loadSettings()
    expect(s.groups[0].rules[0]?.destination).toEqual({ type: 'blockedPage' })
  })

  it('グローバル設定もない旧 storage データは blocked page を補完する', async () => {
    await browser.storage.sync.set({
      groups: [
        {
          id: 'x',
          name: 'old',
          patterns: [],
          timeWindows: [{ type: 'always' }],
          restrictions: [{ type: 'block' }],
        },
      ],
    })
    const s = await loadSettings()
    expect(s.groups[0].rules[0]?.destination).toEqual({ type: 'blockedPage' })
  })

  it('旧 whitelist グループは無効化し、mode を storage から除去する', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'y', name: 'wl', mode: 'whitelist', patterns: [], dailyRules: [] }],
    })
    const s = await loadSettings()
    expect(s.groups[0]).not.toHaveProperty('mode')
    expect(s.groups[0].disabled).toBe(true)

    const stored = await browser.storage.sync.get(['groups'])
    const storedGroups = stored.groups as Array<Record<string, unknown>>
    expect(storedGroups[0]).not.toHaveProperty('mode')
    expect(storedGroups[0]?.disabled).toBe(true)
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

    expect(s.groups[0].rules[0]?.window).toMatchObject({
      type: 'scheduled',
      condition: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
      timeRanges: [{ startMinute: 540, endMinute: 1080 }],
    })
    expect(s.groups[0].rules[0]?.restriction).toEqual({ kind: 'block' })
  })

  it('旧 dailyRules が全曜日同一で上限のみの場合は Daily limit ルール1件へ変換する', async () => {
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

    expect(s.groups[0].rules[0]?.window).toEqual({ type: 'always' })
    expect(s.groups[0].rules[0]?.restriction).toEqual({ kind: 'dailyLimit', minutes: 15 })
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
    expect(s.groups[0].rules).toEqual([])
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
