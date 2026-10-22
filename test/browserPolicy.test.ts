import { describe, expect, it } from 'vitest'
import {
  buildMacProfile,
  buildWindowsCommands,
  detectPolicyEnvironment,
  type PolicyOptions,
} from '../utils/browserPolicy'

const ALL: PolicyOptions = { forceInstall: true, disableIncognito: true, disableGuest: true }

describe('detectPolicyEnvironment', () => {
  it('userAgentData から macOS と Edge を判定する', () => {
    expect(
      detectPolicyEnvironment({
        userAgent: '',
        userAgentData: { platform: 'macOS', brands: [{ brand: 'Microsoft Edge' }] },
      }),
    ).toEqual({ os: 'mac', browser: 'edge' })
  })

  it('navigator.brave があれば Brave と判定する', () => {
    expect(detectPolicyEnvironment({ userAgent: 'Windows NT 10.0', brave: {} })).toEqual({
      os: 'windows',
      browser: 'brave',
    })
  })

  it('判定材料がなければ Windows の Chrome として扱う', () => {
    expect(detectPolicyEnvironment({ userAgent: 'Linux x86_64' })).toEqual({
      os: 'windows',
      browser: 'chrome',
    })
  })

  it('userAgent の Macintosh と Edg/ から判定する', () => {
    expect(
      detectPolicyEnvironment({ userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130 Edg/130' }),
    ).toEqual({ os: 'mac', browser: 'edge' })
  })
})

describe('buildWindowsCommands', () => {
  it('Chrome では Chrome ウェブストアの更新 URL で強制インストールし、シークレットとゲストを無効化する', () => {
    const { apply, undo } = buildWindowsCommands('chrome', 'abc', ALL)
    expect(apply).toBe(
      [
        'reg add "HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "abc;https://clients2.google.com/service/update2/crx" /f',
        'reg add "HKLM\\SOFTWARE\\Policies\\Google\\Chrome" /v IncognitoModeAvailability /t REG_DWORD /d 1 /f',
        'reg add "HKLM\\SOFTWARE\\Policies\\Google\\Chrome" /v BrowserGuestModeEnabled /t REG_DWORD /d 0 /f',
      ].join('\n'),
    )
    expect(undo).toBe(
      [
        'reg delete "HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /v 1 /f',
        'reg delete "HKLM\\SOFTWARE\\Policies\\Google\\Chrome" /v IncognitoModeAvailability /f',
        'reg delete "HKLM\\SOFTWARE\\Policies\\Google\\Chrome" /v BrowserGuestModeEnabled /f',
      ].join('\n'),
    )
  })

  it('Edge では InPrivate のポリシー名と Chrome ウェブストアの更新 URL を使う', () => {
    const { apply } = buildWindowsCommands('edge', 'abc', {
      forceInstall: true,
      disableIncognito: true,
      disableGuest: false,
    })
    expect(apply).toContain('Policies\\Microsoft\\Edge\\ExtensionInstallForcelist')
    expect(apply).toContain('abc;https://clients2.google.com/service/update2/crx')
    expect(apply).toContain('/v InPrivateModeAvailability /t REG_DWORD /d 1')
    expect(apply).not.toContain('BrowserGuestModeEnabled')
  })

  it('何も選ばなければ空になる', () => {
    expect(
      buildWindowsCommands('brave', 'abc', {
        forceInstall: false,
        disableIncognito: false,
        disableGuest: false,
      }),
    ).toEqual({ apply: '', undo: '' })
  })
})

describe('buildMacProfile', () => {
  it('ブラウザのドメインを PayloadType にし、選んだポリシーを含める', () => {
    const xml = buildMacProfile('brave', 'abc', ALL)
    expect(xml).toContain('<key>PayloadType</key><string>com.brave.Browser</string>')
    expect(xml).toContain(
      '<key>ExtensionInstallForcelist</key><array><string>abc;https://clients2.google.com/service/update2/crx</string></array>',
    )
    expect(xml).toContain('<key>IncognitoModeAvailability</key><integer>1</integer>')
    expect(xml).toContain('<key>BrowserGuestModeEnabled</key><false/>')
    expect(xml).toContain('<key>PayloadScope</key><string>System</string>')
  })

  it('選ばなかったポリシーは含めない', () => {
    const xml = buildMacProfile('chrome', 'abc', {
      forceInstall: false,
      disableIncognito: false,
      disableGuest: true,
    })
    expect(xml).not.toContain('ExtensionInstallForcelist')
    expect(xml).not.toContain('IncognitoModeAvailability')
  })
})
