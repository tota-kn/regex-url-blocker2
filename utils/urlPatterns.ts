const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * URL pattern として入力された文字列を前後空白なしの比較用文字列にする。
 */
function normalizePattern(pattern: string): string {
  return pattern.trim().toLowerCase().replace(/\.$/, '')
}

/**
 * hostname を前後空白なしの比較用文字列にする。
 */
function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

/**
 * 文字列が裸ドメイン指定として扱えるなら true を返す。
 */
export function isDomainPattern(pattern: string): boolean {
  const normalized = normalizePattern(pattern)
  if (normalized.length === 0) return false
  if (normalized.includes('://') || normalized.includes('/') || normalized.includes(':')) return false
  if (normalized.includes('*') || normalized.includes('\\')) return false

  const labels = normalized.split('.')
  if (labels.length < 2 || labels.some(label => label.length === 0)) return false
  const topLevelDomain = labels.at(-1)
  if (!topLevelDomain || topLevelDomain.length < 2) return false

  return labels.every(label => DOMAIN_LABEL_RE.test(label))
}

/**
 * URL が裸ドメイン指定に一致するなら true を返す。
 */
function domainPatternMatches(pattern: string, url: string): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  }
  catch {
    return false
  }

  const domain = normalizePattern(pattern)
  const normalizedHostname = normalizeHostname(hostname)
  return normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
}

/**
 * 与えられた文字列が `new RegExp()` で構文解析可能かを返す。空文字は false。
 */
export function isValidRegex(pattern: string): boolean {
  if (pattern.length === 0) return false
  try {
    new RegExp(pattern)
    return true
  }
  catch {
    return false
  }
}

/**
 * 入力値が URL pattern として保存可能なら true を返す。
 */
export function isValidUrlPattern(pattern: string): boolean {
  return isDomainPattern(pattern) || isValidRegex(pattern)
}

/**
 * URL pattern が URL に一致するなら true を返す。
 */
export function urlPatternMatches(pattern: string, url: string): boolean {
  if (isDomainPattern(pattern)) {
    return domainPatternMatches(pattern, url)
  }

  try {
    return new RegExp(pattern).test(url)
  }
  catch {
    return false
  }
}
