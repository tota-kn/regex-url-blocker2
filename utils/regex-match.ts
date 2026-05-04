/**
 * 判定をスキップすべき URL プレフィクス一覧。
 */
export const SKIP_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'file://',
] as const

/**
 * ブロック判定をスキップすべき URL かどうかを返す。
 * システム URL またはリダイレクト先 URL 自身の場合にスキップする（無限ループ防止）。
 */
export function shouldSkipUrl(url: string, redirectUrl: string): boolean {
  if (url === redirectUrl) return true
  return SKIP_URL_PREFIXES.some(prefix => url.startsWith(prefix))
}

/**
 * 正規表現パターン文字列の構文を検証する。
 */
export function validatePattern(pattern: string): { ok: true } | { ok: false, message: string } {
  try {
    new RegExp(pattern)
    return { ok: true }
  }
  catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * パターン文字列の配列をコンパイルする。無効なパターンは無視する。
 */
export function compilePatterns(patterns: string[]): RegExp[] {
  const result: RegExp[] = []
  for (const p of patterns) {
    try {
      result.push(new RegExp(p))
    }
    catch {
      // 無効なパターンは無視
    }
  }
  return result
}

/**
 * URL がコンパイル済み正規表現のいずれかに部分一致するかを返す。
 */
export function matchesAny(url: string, compiled: RegExp[]): boolean {
  return compiled.some(re => re.test(url))
}
