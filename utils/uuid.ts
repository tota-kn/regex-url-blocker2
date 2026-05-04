/**
 * 新しい UUID v4 を生成して返す。
 */
export function newId(): string {
  return crypto.randomUUID()
}
