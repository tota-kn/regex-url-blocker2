import { describe, expect, it } from 'vitest'
import { loadBlockNotificationHistory, loadCounters, loadPageOpenNotificationHistory, loadSettings, loadUsageNotificationHistory, parseSettingsExportJson, saveBlockNotificationHistory, saveCounters, savePageOpenNotificationHistory, saveSettings, saveUsageNotificationHistory, serializeSettingsExport } from '../utils/storage'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '../utils/defaults'

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
    expect(s.global.notificationThresholdMinutes).toBe(5)
    expect(s.global.pageOpenNotificationsEnabled).toBe(true)
    expect(s.global.blockNotificationsEnabled).toBe(true)
  })

  it('global の blockAction が不正な場合は DEFAULT で補完される', async () => {
    await browser.storage.sync.set({ global: { blockAction: 'invalid' } })
    const s = await loadSettings()
    expect(s.global.blockAction).toBe(DEFAULT_GLOBAL_SETTINGS.blockAction)
  })
})

describe('saveSettings', () => {
  it('save → load でラウンドトリップ', async () => {
    const group = { ...createEmptyGroup(), name: 'Twitter', patterns: ['^https?://twitter\\.com'] }
    const settings = {
      global: { ...DEFAULT_GLOBAL_SETTINGS, blockAction: 'blockedPage' as const, redirectUrl: 'https://block.test', dailyResetHour: '03:00' },
      groups: [group],
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
      version: 3,
      settings,
    })
  })

  it('valid JSON import を Settings に変換する', () => {
    const settings = {
      global: { ...DEFAULT_GLOBAL_SETTINGS, blockAction: 'blockedPage' as const, redirectUrl: 'https://block.test', dailyResetHour: '03:00' },
      groups: [{ ...createEmptyGroup('Imported'), patterns: ['example\\.com'] }],
    }

    expect(parseSettingsExportJson(JSON.stringify({ version: 2, settings }))).toEqual(settings)
  })

  it('v2 import はグローバル block action を各グループへ移行する', () => {
    const imported = parseSettingsExportJson(JSON.stringify({
      version: 2,
      settings: {
        global: { ...DEFAULT_GLOBAL_SETTINGS, blockAction: 'redirect', redirectUrl: 'https://legacy-blocked.test' },
        groups: [{
          id: 'legacy',
          name: 'Legacy',
          mode: 'blacklist',
          patterns: ['example\\.com'],
          dailyRules: createEmptyGroup().dailyRules,
        }],
      },
    }))

    expect(imported.groups[0]).toMatchObject({
      blockAction: 'redirect',
      redirectUrl: 'https://legacy-blocked.test',
    })
  })

  it('v3 export/import はグループ別 block action を保持する', () => {
    const settings = {
      global: DEFAULT_GLOBAL_SETTINGS,
      groups: [{ ...createEmptyGroup('Imported'), blockAction: 'redirect' as const, redirectUrl: 'https://group-blocked.test' }],
    }

    expect(parseSettingsExportJson(serializeSettingsExport(settings))).toEqual(settings)
  })

  it('通知設定をエクスポート/インポートでラウンドトリップする', () => {
    const settings = {
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        notificationThresholdMinutes: 12,
        pageOpenNotificationsEnabled: false,
        blockNotificationsEnabled: false,
      },
      groups: [],
    }

    expect(parseSettingsExportJson(serializeSettingsExport(settings))).toEqual(settings)
  })

  it('mode 欠損の互換データは blacklist で補完する', () => {
    const imported = parseSettingsExportJson(JSON.stringify({
      version: 2,
      settings: {
        global: DEFAULT_GLOBAL_SETTINGS,
        groups: [{ id: 'old', name: 'Old', patterns: ['example\\.com'], dailyRules: createEmptyGroup().dailyRules }],
      },
    }))

    expect(imported.groups[0].mode).toBe('blacklist')
    expect(imported.groups[0].lockMode).toBe(false)
  })

  it('不正 JSON は reject する', () => {
    expect(() => parseSettingsExportJson('{')).toThrow('Invalid JSON')
  })

  it('version 不一致は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({ version: 1, settings: { global: DEFAULT_GLOBAL_SETTINGS, groups: [] } })))
      .toThrow('Unsupported settings file version')
  })

  it('settings 欠損は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({ version: 2 }))).toThrow('Settings file is missing settings')
  })

  it('groups 欠損は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({ version: 2, settings: { global: DEFAULT_GLOBAL_SETTINGS } })))
      .toThrow('Settings file is missing groups')
  })

  it('バリデーションエラーがある設定は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({
      version: 2,
      settings: {
        global: { ...DEFAULT_GLOBAL_SETTINGS, dailyResetHour: '99:99' },
        groups: [],
      },
    }))).toThrow('Settings file contains invalid settings')
  })
})

describe('loadSettings のマイグレーション', () => {
  it('groups の mode 欠損は blacklist で補完される', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'x', name: 'old', patterns: [], dailyRules: createEmptyGroup().dailyRules }],
    })
    const s = await loadSettings()
    expect(s.groups[0].mode).toBe('blacklist')
    expect(s.groups[0].lockMode).toBe(false)
  })

  it('旧 storage データのグループ別ブロック先はグローバル設定から補完される', async () => {
    await browser.storage.sync.set({
      global: { blockAction: 'redirect', redirectUrl: 'https://legacy-blocked.test' },
      groups: [{ id: 'x', name: 'old', patterns: [], dailyRules: createEmptyGroup().dailyRules }],
    })
    const s = await loadSettings()
    expect(s.groups[0].blockAction).toBe('redirect')
    expect(s.groups[0].redirectUrl).toBe('https://legacy-blocked.test')
  })

  it('グローバル設定もない旧 storage データは blocked page を補完する', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'x', name: 'old', patterns: [], dailyRules: createEmptyGroup().dailyRules }],
    })
    const s = await loadSettings()
    expect(s.groups[0].blockAction).toBe('blockedPage')
    expect(s.groups[0].redirectUrl).toBe('https://example.com')
  })

  it('whitelist は保持される', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'y', name: 'wl', mode: 'whitelist', patterns: [], dailyRules: createEmptyGroup().dailyRules }],
    })
    const s = await loadSettings()
    expect(s.groups[0].mode).toBe('whitelist')
  })

  it('旧 schedules / blockedTimeSlots / timeLimits フィールドは破棄され空の dailyRules で初期化される', async () => {
    await browser.storage.sync.set({
      groups: [{
        id: 'z',
        name: 'old',
        mode: 'blacklist',
        patterns: [],
        schedules: [{ daysOfWeek: [], start: '09:00', end: '18:00', dailyTimeLimitMinutes: 30 }],
        blockedTimeSlots: [{ daysOfWeek: [], start: '09:00', end: '18:00' }],
        timeLimits: [{ daysOfWeek: [], dailyMinutes: 30 }],
      }],
    })
    const s = await loadSettings()
    expect(s.groups[0].dailyRules).toEqual(createEmptyGroup().dailyRules)
    expect((s.groups[0] as unknown as Record<string, unknown>).schedules).toBeUndefined()
    expect((s.groups[0] as unknown as Record<string, unknown>).blockedTimeSlots).toBeUndefined()
    expect((s.groups[0] as unknown as Record<string, unknown>).timeLimits).toBeUndefined()
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

describe('page open notification history storage', () => {
  it('未設定時は空履歴を返す', async () => {
    expect(await loadPageOpenNotificationHistory()).toEqual({ pageOpenNotificationHistory: {} })
  })

  it('save → load で通知履歴をラウンドトリップする', async () => {
    const history = {
      pageOpenNotificationHistory: {
        group1: { logicalDate: '2026-05-06' },
      },
    }
    await savePageOpenNotificationHistory(history)
    expect(await loadPageOpenNotificationHistory()).toEqual(history)
  })

  it('不正な通知履歴値は読み込み時に除外する', async () => {
    await browser.storage.local.set({
      pageOpenNotificationHistory: {
        ok: { logicalDate: '2026-05-06' },
        badDate: { logicalDate: 123 },
        badEntry: 'x',
      },
    })
    expect(await loadPageOpenNotificationHistory()).toEqual({
      pageOpenNotificationHistory: {
        ok: { logicalDate: '2026-05-06' },
      },
    })
  })
})

describe('block notification history storage', () => {
  it('未設定時は空履歴を返す', async () => {
    expect(await loadBlockNotificationHistory()).toEqual({ blockNotificationHistory: {} })
  })

  it('save → load で通知履歴をラウンドトリップする', async () => {
    const history = {
      blockNotificationHistory: {
        group1: { logicalDate: '2026-05-06' },
      },
    }
    await saveBlockNotificationHistory(history)
    expect(await loadBlockNotificationHistory()).toEqual(history)
  })

  it('不正な通知履歴値は読み込み時に除外する', async () => {
    await browser.storage.local.set({
      blockNotificationHistory: {
        ok: { logicalDate: '2026-05-06' },
        badDate: { logicalDate: 123 },
        badEntry: 'x',
      },
    })
    expect(await loadBlockNotificationHistory()).toEqual({
      blockNotificationHistory: {
        ok: { logicalDate: '2026-05-06' },
      },
    })
  })
})
