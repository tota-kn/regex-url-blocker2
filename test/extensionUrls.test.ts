import { describe, expect, it } from 'vitest'
import { buildBlockedPageUrl, buildWaitPageUrl } from '../utils/extensionUrls'

describe('extension URL builders', () => {
  it('ブロック元 URL と全グループ ID を blocked page に渡す', () => {
    const url = buildBlockedPageUrl({
      extensionId: 'extension-id',
      url: 'https://example.com/path?a=1',
      evaluation: { blockedGroupIds: ['a', 'b'] },
    })
    const parsed = new URL(url)
    expect(parsed.protocol).toBe('chrome-extension:')
    expect(parsed.hostname).toBe('extension-id')
    expect(parsed.pathname).toBe('/blocked.html')
    expect(parsed.searchParams.get('url')).toBe('https://example.com/path?a=1')
    expect(parsed.searchParams.getAll('group')).toEqual(['a', 'b'])
  })

  it('待機条件を wait page に渡す', () => {
    const url = buildWaitPageUrl({
      extensionId: 'extension-id',
      url: 'https://example.com/',
      groupId: 'group',
      seconds: 30,
      grantMinutes: 10,
    })
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/wait.html')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      url: 'https://example.com/',
      group: 'group',
      seconds: '30',
      grantMinutes: '10',
    })
  })
})
