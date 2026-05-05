/**
 * "HH:MM" 形式の時刻文字列。0 埋め2桁（例 "09:30"）。
 */
export type HHMM = string

/**
 * 許可時間帯1組。`end <= start` の場合は日跨ぎ（例 22:00–06:00）として扱う。
 */
export interface AllowedHourRange {
  start: HHMM
  end: HHMM
}

/**
 * ブロック対象グループ。SPEC.md「グループ」節に対応する。
 */
export interface Group {
  /** crypto.randomUUID() で自動採番される一意識別子。 */
  id: string
  /** ユーザー入力の表示名（必須・非空）。 */
  name: string
  /** 正規表現文字列の配列。`new RegExp()` で構文チェックを通る必要がある。 */
  patterns: string[]
  /** 1日あたり閲覧上限（分）。null=上限なし、0=即ブロック、正数=分数。 */
  dailyTimeLimitMinutes: number | null
  /** 許可時間帯。空配列なら24時間 OK。 */
  allowedHours: AllowedHourRange[]
}

/**
 * 拡張機能全体のグローバル設定。SPEC.md「グローバル設定」節に対応する。
 */
export interface GlobalSettings {
  /** 制限超過時のリダイレクト先 URL。 */
  redirectUrl: string
  /** 論理日の境界となる時刻（"HH:MM"）。 */
  dailyResetHour: HHMM
}

/**
 * chrome.storage.sync に保存される全体構造のミラー。
 */
export interface Settings {
  global: GlobalSettings
  groups: Group[]
}
