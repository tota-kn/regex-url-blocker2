import { describe, expect, test } from 'vitest'
import { compilePatterns, matchesAny, shouldSkipUrl, validatePattern } from '@/utils/regex-match'

describe('shouldSkipUrl', () => {
  const redirect = 'https://example.com'
  test('chrome:// はスキップ', () => {
    expect(shouldSkipUrl('chrome://settings', redirect)).toBe(true)
  })
  test('chrome-extension:// はスキップ', () => {
    expect(shouldSkipUrl('chrome-extension://abc123/options.html', redirect)).toBe(true)
  })
  test('about: はスキップ', () => {
    expect(shouldSkipUrl('about:blank', redirect)).toBe(true)
  })
  test('file:// はスキップ', () => {
    expect(shouldSkipUrl('file:///home/user/test.html', redirect)).toBe(true)
  })
  test('redirectUrl 完全一致はスキップ（ループ防止）', () => {
    expect(shouldSkipUrl('https://example.com', redirect)).toBe(true)
  })
  test('通常の https URL はスキップしない', () => {
    expect(shouldSkipUrl('https://twitter.com/home', redirect)).toBe(false)
  })
  test('redirectUrl 部分一致はスキップしない', () => {
    expect(shouldSkipUrl('https://example.com/page', redirect)).toBe(false)
  })
})

describe('validatePattern', () => {
  test('有効な正規表現は ok:true', () => {
    expect(validatePattern('twitter\\.com')).toEqual({ ok: true })
    expect(validatePattern('.*youtube\\.com.*')).toEqual({ ok: true })
  })
  test('無効な正規表現は ok:false + message', () => {
    const result = validatePattern('(unclosed')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBeTruthy()
  })
})

describe('compilePatterns', () => {
  test('有効なパターンをコンパイルして返す', () => {
    const compiled = compilePatterns(['twitter\\.com', 'facebook\\.com'])
    expect(compiled).toHaveLength(2)
  })
  test('無効なパターンは無視してコンパイル済みのみ返す', () => {
    const compiled = compilePatterns(['twitter\\.com', '(invalid'])
    expect(compiled).toHaveLength(1)
  })
})

describe('matchesAny', () => {
  test('URL が正規表現にマッチする', () => {
    const compiled = compilePatterns(['twitter\\.com'])
    expect(matchesAny('https://twitter.com/home', compiled)).toBe(true)
  })
  test('パスやクエリも含めて部分一致', () => {
    const compiled = compilePatterns(['\\.com/watch'])
    expect(matchesAny('https://www.youtube.com/watch?v=abc', compiled)).toBe(true)
  })
  test('マッチしない URL は false', () => {
    const compiled = compilePatterns(['twitter\\.com'])
    expect(matchesAny('https://www.google.com', compiled)).toBe(false)
  })
  test('パターンが空の場合は false', () => {
    expect(matchesAny('https://twitter.com', [])).toBe(false)
  })
})
