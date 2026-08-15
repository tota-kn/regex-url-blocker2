import { describe, expect, it } from 'vitest'
import { normalizeTheme } from '../utils/theme'

describe('normalizeTheme', () => {
  it.each(['auto', 'light', 'dark'] as const)('%s を保持する', (theme) => {
    expect(normalizeTheme(theme)).toBe(theme)
  })

  it.each([undefined, null, 'sepia', 1])('%j は auto に戻す', (theme) => {
    expect(normalizeTheme(theme)).toBe('auto')
  })
})
