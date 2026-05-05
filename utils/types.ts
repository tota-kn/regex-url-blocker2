/**
 * "HH:MM" 形式の時刻文字列。0 埋め2桁（例 "09:30"）。
 */
export type HHMM = string

/**
 * 曜日番号。JS の `Date.getDay()` 互換で 0=日, 1=月, ..., 6=土。
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * グループの許可スケジュール1組。曜日・時間帯・上限分数をひとまとめにする。
 *
 * - `daysOfWeek` が空配列なら全曜日に適用。
 * - `end <= start` のときは日跨ぎ（例 22:00–06:00）として扱う。
 * - `dailyTimeLimitMinutes` は null=上限なし、0=即ブロック、正数=分数。
 *
 * 同じ曜日・時刻で複数スケジュールがマッチした場合の有効上限は、`null` を「上限なし=∞」とみなした
 * 最も厳しい値（最小）を採用する。
 */
export interface Schedule {
  daysOfWeek: DayOfWeek[]
  start: HHMM
  end: HHMM
  dailyTimeLimitMinutes: number | null
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
  /** 許可スケジュールの配列。空配列=24時間・上限なし。 */
  schedules: Schedule[]
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
