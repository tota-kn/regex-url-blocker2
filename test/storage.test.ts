import { describe, expect, it } from 'vitest'
import { parseSettingsExportJson, serializeSettingsExport, loadCounters, loadSettings, saveCounters, saveSettings } from '../utils/storage'
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
      global: { blockAction: 'blockedPage' as const, redirectUrl: 'https://block.test', dailyResetHour: '03:00' },
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
      version: 1,
      settings,
    })
  })

  it('valid JSON import を Settings に変換する', () => {
    const settings = {
      global: { blockAction: 'blockedPage' as const, redirectUrl: 'https://block.test', dailyResetHour: '03:00' },
      groups: [{ ...createEmptyGroup('Imported'), patterns: ['example\\.com'] }],
    }

    expect(parseSettingsExportJson(JSON.stringify({ version: 1, settings }))).toEqual(settings)
  })

  it('mode 欠損の互換データは blacklist で補完する', () => {
    const imported = parseSettingsExportJson(JSON.stringify({
      version: 1,
      settings: {
        global: DEFAULT_GLOBAL_SETTINGS,
        groups: [{ id: 'old', name: 'Old', patterns: ['example\\.com'], blockedTimeSlots: [], timeLimits: [] }],
      },
    }))

    expect(imported.groups[0].mode).toBe('blacklist')
  })

  it('不正 JSON は reject する', () => {
    expect(() => parseSettingsExportJson('{')).toThrow('Invalid JSON')
  })

  it('version 不一致は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({ version: 2, settings: { global: DEFAULT_GLOBAL_SETTINGS, groups: [] } })))
      .toThrow('Unsupported settings file version')
  })

  it('settings 欠損は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({ version: 1 }))).toThrow('Settings file is missing settings')
  })

  it('groups 欠損は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({ version: 1, settings: { global: DEFAULT_GLOBAL_SETTINGS } })))
      .toThrow('Settings file is missing groups')
  })

  it('バリデーションエラーがある設定は reject する', () => {
    expect(() => parseSettingsExportJson(JSON.stringify({
      version: 1,
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
      groups: [{ id: 'x', name: 'old', patterns: [], blockedTimeSlots: [], timeLimits: [] }],
    })
    const s = await loadSettings()
    expect(s.groups[0].mode).toBe('blacklist')
  })

  it('whitelist は保持される', async () => {
    await browser.storage.sync.set({
      groups: [{ id: 'y', name: 'wl', mode: 'whitelist', patterns: [], blockedTimeSlots: [], timeLimits: [] }],
    })
    const s = await loadSettings()
    expect(s.groups[0].mode).toBe('whitelist')
  })

  it('旧 schedules フィールドは破棄され blockedTimeSlots/timeLimits で初期化される', async () => {
    await browser.storage.sync.set({
      groups: [{
        id: 'z',
        name: 'old',
        mode: 'blacklist',
        patterns: [],
        schedules: [{ daysOfWeek: [], start: '09:00', end: '18:00', dailyTimeLimitMinutes: 30 }],
      }],
    })
    const s = await loadSettings()
    expect(s.groups[0].blockedTimeSlots).toEqual([])
    expect(s.groups[0].timeLimits).toEqual([])
    expect((s.groups[0] as unknown as Record<string, unknown>).schedules).toBeUndefined()
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
