import { describe, expect, it } from 'vitest'
import {
  ACTION_TITLE,
  BADGE_COLOR_BLOCKED,
  BADGE_COLOR_NORMAL,
  BADGE_COLOR_PAUSED,
  BADGE_COLOR_WARNING,
  badgeColor,
  buildActionState,
} from '../utils/actionBadge'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import { settingsPair } from '../utils/settingsPair'
import { group, settings } from './helpers'
import type { Settings } from '../utils/types'

const emptySettings: Settings = { global: DEFAULT_GLOBAL_SETTINGS, groups: [] }

describe('action badge', () => {
  it('残り時間に応じて通常・警告・ブロック色を返す', () => {
    expect(badgeColor(301)).toBe(BADGE_COLOR_NORMAL)
    expect(badgeColor(300)).toBe(BADGE_COLOR_WARNING)
    expect(badgeColor(0)).toBe(BADGE_COLOR_BLOCKED)
  })

  it('対象の上限がなければ空の badge 状態を返す', () => {
    expect(
      buildActionState(
        settingsPair(emptySettings, emptySettings),
        { counters: {} },
        { groupPauseState: {} },
        'https://example.com/',
        new Date('2026-05-06T12:00:00+09:00'),
      ),
    ).toEqual({ text: '', title: ACTION_TITLE, color: BADGE_COLOR_NORMAL })
  })

  describe('一時停止中', () => {
    const now = new Date('2026-05-06T12:00:00+09:00')
    const pausedSettings = settings([
      group({ id: 'a', patterns: ['example\\.com'] }),
      group({ id: 'b', patterns: ['example\\.com'] }),
      group({ id: 'expired', patterns: ['example\\.com'] }),
      group({ id: 'waiting', patterns: ['example\\.com'] }),
      group({ id: 'other', patterns: ['other\\.com'] }),
    ])
    const pauseState = {
      groupPauseState: {
        a: { pausedUntil: now.getTime() + 9 * 60_000 + 1_000 },
        b: { pausedUntil: now.getTime() + 30 * 60_000 },
        expired: { pausedUntil: now.getTime() - 1_000 },
        waiting: { waitingUntil: now.getTime() + 60_000 },
        other: { pausedUntil: now.getTime() + 60_000 },
      },
    }
    const build = (url: string) =>
      buildActionState(
        settingsPair(pausedSettings, pausedSettings),
        { counters: {} },
        pauseState,
        url,
        now,
      )

    it('対象サイトでは、そのサイトに一致するグループの解除までの最短時間を表示する', () => {
      expect(build('https://example.com/')).toEqual({
        text: '10m',
        title: 'Regex URL Guard - paused 10m',
        color: BADGE_COLOR_PAUSED,
      })
    })

    it('一時停止中のグループに一致しないサイトでは表示しない', () => {
      expect(build('https://unrelated.test/')).toEqual({
        text: '',
        title: ACTION_TITLE,
        color: BADGE_COLOR_NORMAL,
      })
    })
  })
})
