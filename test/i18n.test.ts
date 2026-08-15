import { afterEach, describe, expect, it } from 'vitest'
import { enMessages, jaMessages, resolveLocale, setLanguage, translate } from '@/utils/i18n'

describe('i18n', () => {
  afterEach(() => setLanguage('en'))

  it('auto は日本語の主言語だけを日本語へ解決する', () => {
    expect(resolveLocale('auto', 'ja-JP')).toBe('ja')
    expect(resolveLocale('auto', 'en-US')).toBe('en')
    expect(resolveLocale('auto', 'fr')).toBe('en')
  })

  it('明示指定はブラウザ言語より優先する', () => {
    expect(resolveLocale('en', 'ja')).toBe('en')
    expect(resolveLocale('ja', 'en')).toBe('ja')
  })

  it('英語と日本語のカタログは同じキー集合を持つ', () => {
    expect(Object.keys(jaMessages).toSorted()).toEqual(Object.keys(enMessages).toSorted())
  })

  it('日本語の補間と複数形を処理する', () => {
    setLanguage('ja')
    expect(translate('Wait {seconds} sec', { seconds: 10 })).toBe('10秒待機')
    expect(translate('{count} minute | {count} minutes', { count: 3 })).toBe('3分')
    expect(translate('{group}: {minutes} remaining today.', { group: 'SNS', minutes: '5分' })).toBe(
      'SNS：今日の残り時間は5分です。',
    )
  })

  it('未知のキーは英語原文へフォールバックする', () => {
    setLanguage('ja')
    expect(translate('Uncatalogued English text')).toBe('Uncatalogued English text')
  })
})
