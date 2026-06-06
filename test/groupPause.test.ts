import { describe, expect, it } from 'vitest'
import { formatPauseDuration, getGroupPauseButtonState, getGroupPauseDisplayState } from '../utils/groupPause'

describe('group pause button state', () => {
  const now = new Date('2026-05-06T12:00:00+09:00')

  it('未設定なら一時停止リクエストを開始できる', () => {
    expect(getGroupPauseButtonState(undefined, now)).toEqual({
      label: 'Request pause',
      paused: false,
    })
  })

  it('保存済み待機値が未来でも一時停止リクエストからやり直す', () => {
    expect(getGroupPauseButtonState({ waitingUntil: now.getTime() + 10_100 }, now)).toEqual({
      label: 'Request pause',
      paused: false,
    })
  })

  it('保存済み待機値が期限切れでも一時停止リクエストからやり直す', () => {
    expect(getGroupPauseButtonState({ waitingUntil: now.getTime() }, now)).toEqual({
      label: 'Request pause',
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
      label: 'Request pause 0:11 left',
      kind: 'waiting',
    })
  })

  it('popup 表示では待機完了状態を返す', () => {
    expect(getGroupPauseDisplayState({ waitingUntil: now.getTime() }, now)).toEqual({
      label: 'Request pause ready',
      kind: 'ready',
    })
  })

  it('残り時間は M:SS 形式で切り上げ表示する', () => {
    expect(formatPauseDuration(1)).toBe('0:01')
    expect(formatPauseDuration(60_001)).toBe('1:01')
    expect(formatPauseDuration(125_000)).toBe('2:05')
  })
})
