import { describe, expect, it } from 'vitest'
import { normalizeDelayGrantState } from '../utils/delayGrant'
import { loadDelayGrantState, saveDelayGrantState } from '../utils/storage'

describe('normalizeDelayGrantState', () => {
  it('object でない値は空状態にフォールバックする', () => {
    expect(normalizeDelayGrantState(undefined)).toEqual({ delayGrantState: {} })
    expect(normalizeDelayGrantState('x')).toEqual({ delayGrantState: {} })
    expect(normalizeDelayGrantState([])).toEqual({ delayGrantState: {} })
  })

  it('期限切れ・不正・未知 group id を除外する', () => {
    const now = 1_000_000
    const value = {
      active: { grantedUntil: now + 60_000 },
      expired: { grantedUntil: now - 1 },
      badType: { grantedUntil: 'x' },
      badEntry: 'x',
      unknown: { grantedUntil: now + 60_000 },
    }

    expect(
      normalizeDelayGrantState(value, ['active', 'expired', 'badType', 'badEntry'], now),
    ).toEqual({
      delayGrantState: {
        active: { grantedUntil: now + 60_000 },
      },
    })
  })

  it('validGroupIds 未指定なら group id を絞り込まない', () => {
    const now = 1_000_000
    expect(
      normalizeDelayGrantState({ any: { grantedUntil: now + 60_000 } }, undefined, now),
    ).toEqual({
      delayGrantState: { any: { grantedUntil: now + 60_000 } },
    })
  })
})

describe('delay grant state storage', () => {
  it('未設定時は空状態を返す', async () => {
    expect(await loadDelayGrantState()).toEqual({ delayGrantState: {} })
  })

  it('save → load で許可状態をラウンドトリップする', async () => {
    const state = {
      delayGrantState: {
        group1: { grantedUntil: Date.now() + 600_000 },
      },
    }
    await saveDelayGrantState(state)
    expect(await loadDelayGrantState()).toEqual(state)
  })

  it('期限切れ・削除済み group id は読み込み時に除外する', async () => {
    const now = 1_000_000
    await browser.storage.local.set({
      delayGrantState: {
        active: { grantedUntil: now + 600_000 },
        expired: { grantedUntil: now - 1 },
        removed: { grantedUntil: now + 600_000 },
      },
    })

    expect(await loadDelayGrantState(['active', 'expired'], now)).toEqual({
      delayGrantState: {
        active: { grantedUntil: now + 600_000 },
      },
    })
  })
})
