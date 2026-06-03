import { describe, expect, it } from 'vitest'
import { getGroupPauseButtonState } from '../utils/groupPause'

describe('group pause button state', () => {
  const now = new Date('2026-05-06T12:00:00+09:00')

  it('未設定なら一時停止リクエストを開始できる', () => {
    expect(getGroupPauseButtonState(undefined, now)).toEqual({
      label: 'Request 10 min pause',
      clickable: true,
    })
  })

  it('待機中なら残り秒数を表示して押せない', () => {
    expect(getGroupPauseButtonState({ waitingUntil: now.getTime() + 10_100 }, now)).toEqual({
      label: 'Wait 11s',
      clickable: false,
    })
  })

  it('待機完了後なら10分一時停止を開始できる', () => {
    expect(getGroupPauseButtonState({ waitingUntil: now.getTime() }, now)).toEqual({
      label: 'Pause for 10 min',
      clickable: true,
    })
  })

  it('一時停止中なら残り時間を表示して押せない', () => {
    expect(getGroupPauseButtonState({ pausedUntil: now.getTime() + 125_000 }, now)).toEqual({
      label: 'Paused 2:05',
      clickable: false,
    })
  })
})
