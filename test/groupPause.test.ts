import { describe, expect, it } from 'vitest'
import { getGroupPauseButtonState } from '../utils/groupPause'

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
})
