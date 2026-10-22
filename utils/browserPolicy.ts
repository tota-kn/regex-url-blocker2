/** ポリシー設定手順を出し分ける OS。 */
export type PolicyOs = 'windows' | 'mac'

/** ポリシー設定手順を出し分けるブラウザ。 */
export type PolicyBrowser = 'chrome' | 'edge' | 'brave'

/** 生成するポリシーの選択。 */
export interface PolicyOptions {
  /** 拡張機能を強制インストールし、削除・無効化できなくする。 */
  forceInstall: boolean
  /** シークレット（InPrivate）ウィンドウを使えなくする。 */
  disableIncognito: boolean
  /** ゲストモードを使えなくする。 */
  disableGuest: boolean
}

/** ブラウザごとのポリシー格納先と名前。 */
export const POLICY_BROWSERS: Record<
  PolicyBrowser,
  {
    label: string
    registryKey: string
    macDomain: string
    incognitoPolicy: string
    updateUrl: string
    policyPage: string
  }
> = {
  chrome: {
    label: 'Google Chrome',
    registryKey: 'HKLM\\SOFTWARE\\Policies\\Google\\Chrome',
    macDomain: 'com.google.Chrome',
    incognitoPolicy: 'IncognitoModeAvailability',
    updateUrl: 'https://clients2.google.com/service/update2/crx',
    policyPage: 'chrome://policy',
  },
  edge: {
    label: 'Microsoft Edge',
    registryKey: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge',
    macDomain: 'com.microsoft.Edge',
    incognitoPolicy: 'InPrivateModeAvailability',
    // Edge Add-ons には未掲載で、Edge でも Chrome ウェブストア版の ID で動いているため。
    updateUrl: 'https://clients2.google.com/service/update2/crx',
    policyPage: 'edge://policy',
  },
  brave: {
    label: 'Brave',
    registryKey: 'HKLM\\SOFTWARE\\Policies\\BraveSoftware\\Brave',
    macDomain: 'com.brave.Browser',
    incognitoPolicy: 'IncognitoModeAvailability',
    updateUrl: 'https://clients2.google.com/service/update2/crx',
    policyPage: 'brave://policy',
  },
}

/** 環境判定に使う navigator の一部。 */
export interface PolicyNavigator {
  userAgent: string
  userAgentData?: { platform?: string; brands?: { brand: string }[] }
  brave?: unknown
}

/** navigator から OS とブラウザを推定する。判定できなければ Windows / Chrome とする。 */
export function detectPolicyEnvironment(nav: PolicyNavigator): {
  os: PolicyOs
  browser: PolicyBrowser
} {
  const platform = nav.userAgentData?.platform ?? nav.userAgent
  const os: PolicyOs = /mac/i.test(platform) ? 'mac' : 'windows'
  const brands = nav.userAgentData?.brands?.map((b) => b.brand).join(' ') ?? ''
  let browser: PolicyBrowser = 'chrome'
  if (nav.brave !== undefined || /Brave/.test(brands)) browser = 'brave'
  else if (/Microsoft Edge/.test(brands) || /Edg\//.test(nav.userAgent)) browser = 'edge'
  return { os, browser }
}

/** Windows の管理者コマンドプロンプトで実行する reg コマンドを、適用用と解除用で返す。 */
export function buildWindowsCommands(
  browser: PolicyBrowser,
  extensionId: string,
  options: PolicyOptions,
): { apply: string; undo: string } {
  const { registryKey: key, incognitoPolicy, updateUrl } = POLICY_BROWSERS[browser]
  const apply: string[] = []
  const undo: string[] = []
  if (options.forceInstall) {
    apply.push(
      `reg add "${key}\\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "${extensionId};${updateUrl}" /f`,
    )
    undo.push(`reg delete "${key}\\ExtensionInstallForcelist" /v 1 /f`)
  }
  const dwords: [string, number][] = []
  if (options.disableIncognito) dwords.push([incognitoPolicy, 1])
  if (options.disableGuest) dwords.push(['BrowserGuestModeEnabled', 0])
  for (const [name, value] of dwords) {
    apply.push(`reg add "${key}" /v ${name} /t REG_DWORD /d ${value} /f`)
    undo.push(`reg delete "${key}" /v ${name} /f`)
  }
  return { apply: apply.join('\n'), undo: undo.join('\n') }
}

/** macOS の構成プロファイル（.mobileconfig）の XML を返す。 */
export function buildMacProfile(
  browser: PolicyBrowser,
  extensionId: string,
  options: PolicyOptions,
): string {
  const { label, macDomain, incognitoPolicy, updateUrl } = POLICY_BROWSERS[browser]
  const policies: string[] = []
  if (options.forceInstall) {
    policies.push(
      `<key>ExtensionInstallForcelist</key><array><string>${extensionId};${updateUrl}</string></array>`,
    )
  }
  if (options.disableIncognito) policies.push(`<key>${incognitoPolicy}</key><integer>1</integer>`)
  if (options.disableGuest) policies.push('<key>BrowserGuestModeEnabled</key><false/>')
  // 同じ PayloadIdentifier で入れ直せば上書きされるため、UUID は毎回新しくてよい。
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
<key>PayloadContent</key>
<array>
<dict>
<key>PayloadType</key><string>${macDomain}</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>regex-url-guard.policy.${macDomain}</string>
<key>PayloadUUID</key><string>${crypto.randomUUID()}</string>
<key>PayloadDisplayName</key><string>${label}</string>
${policies.join('\n')}
</dict>
</array>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>regex-url-guard.policy.${browser}</string>
<key>PayloadUUID</key><string>${crypto.randomUUID()}</string>
<key>PayloadDisplayName</key><string>Regex URL Guard - ${label}</string>
<key>PayloadScope</key><string>System</string>
</dict>
</plist>
`
}
