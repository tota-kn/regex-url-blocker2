import { describe, expect, it } from 'vitest'
import { normalizeChallenge, mergeChallenges, createChallengeText } from '../utils/accessChallenge'
import {
  loadSettings,
  saveSettings,
  parseSettingsExportJson,
  serializeSettingsExport,
} from '../utils/storage'
import { createEmptyGroup } from './helpers'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import { validateGroup } from '../utils/validation'
import { getEffectiveWaitForPair, resolveEffectiveWait } from '../utils/groupStatus'

describe('access challenges', () => {
  it('文字入力は12文字×5個が既定で不正値を制限する', () => {
    expect(normalizeChallenge({ type: 'typing' })).toEqual({ type: 'typing', length: 12, count: 5 })
    expect(normalizeChallenge({ type: 'typing', length: 1, count: Infinity })).toEqual({
      type: 'typing',
      length: 12,
      count: 5,
    })
    expect(normalizeChallenge({ type: 'unknown' })).toBeUndefined()
  })
  it('基準と最新の課題を保ち同じ種類は厳しい値を採る', () => {
    expect(
      mergeChallenges([
        { type: 'typing', length: 12, count: 5 },
        { type: 'typing', length: 20, count: 2 },
      ]),
    ).toEqual([{ type: 'typing', length: 20, count: 5 }])
  })
  it('秒数ゼロでも課題があればゲートを課す', () => {
    expect(
      resolveEffectiveWait([
        {
          id: 'task',
          window: { type: 'always' },
          restriction: {
            kind: 'wait',
            seconds: 0,
            grantMinutes: 10,
            challenge: { type: 'typing', length: 12, count: 5 },
          },
        },
      ])?.challenges,
    ).toEqual([{ type: 'typing', length: 12, count: 5 }])
  })
  it('指定した長さの紛らわしくない英数字を生成する', () => {
    const first = createChallengeText(12)
    expect(first).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{12}$/)
    expect(createChallengeText(12)).not.toBe(first)
  })
})

describe('課題の適用と所要量', () => {
  it('保存とエクスポートの往復で課題の条件を保持する', async () => {
    const group = createEmptyGroup('Task')
    group.patterns = ['example.com']
    group.rules = [
      {
        id: 'task',
        window: { type: 'always' },
        restriction: {
          kind: 'wait',
          seconds: 60,
          grantMinutes: 10,
          challenge: { type: 'typing', length: 24, count: 7 },
        },
      },
    ]
    const settings = { global: DEFAULT_GLOBAL_SETTINGS, groups: [group] }
    await saveSettings(settings)
    expect((await loadSettings()).groups[0].rules).toEqual(group.rules)
    expect(parseSettingsExportJson(serializeSettingsExport(settings)).groups[0].rules).toEqual(
      group.rules,
    )
    group.rules[0].restriction = {
      kind: 'wait',
      seconds: 60,
      grantMinutes: 10,
      challenge: { type: 'typing', length: 11, count: 0 },
    }
    expect(validateGroup(group).map((error) => error.field)).toContain(
      'rules[0].restriction.challenge.length',
    )
    expect(validateGroup(group).map((error) => error.field)).toContain(
      'rules[0].restriction.challenge.count',
    )
  })
  it('制限維持の基準と最新の文字入力課題は厳しい値を合わせて課す', () => {
    const group = createEmptyGroup('Task')
    group.patterns = ['example.com']
    group.lockMode = true
    group.rules = [
      {
        id: 'task',
        window: { type: 'always' },
        restriction: {
          kind: 'wait',
          seconds: 60,
          grantMinutes: 10,
          challenge: { type: 'typing', length: 20, count: 2 },
        },
      },
    ]
    const baseline = { global: DEFAULT_GLOBAL_SETTINGS, groups: [group] }
    const preferred = structuredClone(baseline)
    preferred.groups[0].rules[0].restriction = {
      kind: 'wait',
      seconds: 60,
      grantMinutes: 10,
      challenge: { type: 'typing', length: 12, count: 5 },
    }
    expect(
      getEffectiveWaitForPair({ baseline, preferred }, group.id, 'https://example.com/', new Date())
        ?.challenges,
    ).toEqual([{ type: 'typing', length: 20, count: 5 }])
  })
})
