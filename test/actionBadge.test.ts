import { describe, expect, it } from 'vitest'
import {
  ACTION_TITLE,
  BADGE_COLOR_BLOCKED,
  BADGE_COLOR_NORMAL,
  BADGE_COLOR_WARNING,
  badgeColor,
  buildActionState,
} from '../utils/actionBadge'
import { DEFAULT_GLOBAL_SETTINGS } from '../utils/defaults'
import { settingsPair } from '../utils/settingsPair'
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
        'https://example.com/',
        new Date('2026-05-06T12:00:00+09:00'),
      ),
    ).toEqual({ text: '', title: ACTION_TITLE, color: BADGE_COLOR_NORMAL })
  })
})
