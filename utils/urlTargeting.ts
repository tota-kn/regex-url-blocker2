import type { Group, Settings } from './types'
import { urlPatternMatches } from './urlPatterns'

const SKIPPED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'file://']

/** URL が判定対象外なら true を返す。 */
export function shouldSkipUrl(url: string | undefined, redirectUrls: string | string[]): boolean {
  if (!url) return true
  const urls = Array.isArray(redirectUrls) ? redirectUrls : [redirectUrls]
  if (urls.includes(url)) return true
  return SKIPPED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
}

/** settings 内の全有効グループが指定する遷移先 URL を返す。 */
export function getRedirectUrls(settings: Settings): string[] {
  return settings.groups
    .filter((group) => !group.disabled)
    .flatMap((group) =>
      group.rules.flatMap((rule) =>
        rule.destination?.type === 'redirect' && rule.destination.url.trim().length > 0
          ? [rule.destination.url]
          : [],
      ),
    )
}

/** URL が group の制限対象に該当するなら true。 */
export function isTargetGroup(group: Group, url: string): boolean {
  return group.patterns.some((pattern) => urlPatternMatches(pattern, url))
}

/** URL が制限対象として該当する group id を返す。 */
export function getTargetGroupIds(settings: Settings, url: string | undefined): string[] {
  if (shouldSkipUrl(url, getRedirectUrls(settings)) || !url) return []
  return settings.groups
    .filter((group) => !group.disabled)
    .filter((group) => isTargetGroup(group, url))
    .map((group) => group.id)
}
