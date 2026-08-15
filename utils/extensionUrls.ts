import type { UrlEvaluation } from './blocking'

/** ブロックページ URL の生成に必要な入力。 */
export interface BlockedPageUrlInput {
  /** 拡張機能 ID。 */
  extensionId: string
  /** ブロックされた元 URL。 */
  url: string
  /** URL 評価結果。 */
  evaluation: Pick<UrlEvaluation, 'blockedGroupIds'>
}

/** 拡張機能のブロックページ URL を生成する。 */
export function buildBlockedPageUrl(input: BlockedPageUrlInput): string {
  const target = new URL(`chrome-extension://${input.extensionId}/blocked.html`)
  target.searchParams.set('url', input.url)
  for (const groupId of input.evaluation.blockedGroupIds)
    target.searchParams.append('group', groupId)
  return target.toString()
}

/** 待機ページ URL の生成に必要な入力。 */
export interface WaitPageUrlInput {
  /** 拡張機能 ID。 */
  extensionId: string
  /** 待機後に戻る URL。 */
  url: string
  /** 待機対象グループ ID。 */
  groupId: string
  /** 待機秒数。 */
  seconds: number
  /** 通過後の許可期間（分）。 */
  grantMinutes: number
}

/** 拡張機能の待機ページ URL を生成する。 */
export function buildWaitPageUrl(input: WaitPageUrlInput): string {
  const target = new URL(`chrome-extension://${input.extensionId}/wait.html`)
  target.searchParams.set('url', input.url)
  target.searchParams.set('group', input.groupId)
  target.searchParams.set('seconds', String(input.seconds))
  target.searchParams.set('grantMinutes', String(input.grantMinutes))
  return target.toString()
}
