import { describe, expect, it } from 'vitest'
import {
  formatPauseDuration,
  getGroupPauseButtonState,
  getGroupPauseDisplayState,
  getPauseAllowedGroupIds,
  isGroupPauseAllowed,
} from '../utils/groupPause'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import type { Settings } from '../utils/types'
import { createEmptyGroup } from './helpers'

describe('group pause button state', () => {
  const now = new Date('2026-05-06T12:00:00+09:00')

  it('未設定なら一時停止リクエストを開始できる', () => {
    expect(getGroupPauseButtonState(undefined, now)).toEqual({
      label: 'Pause',
      paused: false,
    })
  })

  it('保存済み待機値が未来でも一時停止リクエストからやり直す', () => {
    expect(getGroupPauseButtonState({ waitingUntil: now.getTime() + 10_100 }, now)).toEqual({
      label: 'Pause',
      paused: false,
    })
  })

  it('保存済み待機値が期限切れでも一時停止リクエストからやり直す', () => {
    expect(getGroupPauseButtonState({ waitingUntil: now.getTime() }, now)).toEqual({
      label: 'Pause',
      paused: false,
    })
  })

  it('一時停止中なら残り時間を表示して押せない', () => {
    expect(getGroupPauseButtonState({ pausedUntil: now.getTime() + 125_000 }, now)).toEqual({
      label: 'Paused 2:05',
      paused: true,
    })
  })

  it('popup 表示では一時停止中の残り時間を返す', () => {
    expect(getGroupPauseDisplayState({ pausedUntil: now.getTime() + 125_000 }, now)).toEqual({
      label: 'Paused 2:05',
      kind: 'paused',
    })
  })

  it('popup 表示では待機中の残り時間を返す', () => {
    expect(getGroupPauseDisplayState({ waitingUntil: now.getTime() + 10_100 }, now)).toEqual({
      label: 'Pause 0:11 left',
      kind: 'waiting',
    })
  })

  it('popup 表示では待機完了状態を返す', () => {
    expect(getGroupPauseDisplayState({ waitingUntil: now.getTime() }, now)).toEqual({
      label: 'Pause ready',
      kind: 'ready',
    })
  })

  it('残り時間は M:SS 形式で切り上げ表示する', () => {
    expect(formatPauseDuration(1)).toBe('0:01')
    expect(formatPauseDuration(60_001)).toBe('1:01')
    expect(formatPauseDuration(125_000)).toBe('2:05')
  })
})

describe('group pause permission', () => {
  /** 指定 group を1件だけ持つテスト用設定を生成する。 */
  function settingsWith(groupId: string, pauseAllowed: boolean): Settings {
    return {
      global: { ...DEFAULT_GLOBAL_SETTINGS },
      groups: [{ ...createEmptyGroup('Group'), id: groupId, pauseAllowed }],
    }
  }

  it('基準設定と希望設定の両方が許可していれば Pause できる', () => {
    expect(isGroupPauseAllowed('g1', [settingsWith('g1', true), settingsWith('g1', true)])).toBe(
      true,
    )
  })

  it('希望設定で禁止したら即時に Pause できなくなる', () => {
    expect(isGroupPauseAllowed('g1', [settingsWith('g1', true), settingsWith('g1', false)])).toBe(
      false,
    )
  })

  it('基準設定が禁止のままなら希望設定で許可しても Pause できない', () => {
    expect(isGroupPauseAllowed('g1', [settingsWith('g1', false), settingsWith('g1', true)])).toBe(
      false,
    )
  })

  it('片方の設定に存在しない group はもう片方の設定で判定する', () => {
    const empty: Settings = { global: { ...DEFAULT_GLOBAL_SETTINGS }, groups: [] }
    expect(isGroupPauseAllowed('g1', [empty, settingsWith('g1', false)])).toBe(false)
    expect(isGroupPauseAllowed('g1', [empty, settingsWith('g1', true)])).toBe(true)
  })

  it('Pause 可能な group id だけを基準設定の並びで返す', () => {
    const baseline: Settings = {
      global: { ...DEFAULT_GLOBAL_SETTINGS },
      groups: [
        { ...createEmptyGroup('Allowed'), id: 'allowed', pauseAllowed: true },
        { ...createEmptyGroup('Blocked by baseline'), id: 'baselineOff', pauseAllowed: false },
        { ...createEmptyGroup('Blocked by preferred'), id: 'preferredOff', pauseAllowed: true },
      ],
    }
    const preferred: Settings = {
      global: { ...DEFAULT_GLOBAL_SETTINGS },
      groups: [
        { ...createEmptyGroup('Allowed'), id: 'allowed', pauseAllowed: true },
        { ...createEmptyGroup('Blocked by baseline'), id: 'baselineOff', pauseAllowed: true },
        { ...createEmptyGroup('Blocked by preferred'), id: 'preferredOff', pauseAllowed: false },
      ],
    }

    expect(getPauseAllowedGroupIds(baseline, preferred)).toEqual(['allowed'])
  })
})
