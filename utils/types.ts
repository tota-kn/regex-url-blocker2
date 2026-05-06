/**
 * "HH:MM" 形式の時刻文字列。0 埋め2桁（例 "09:30"）。
 */
export type HHMM = string

/**
 * 曜日番号。JS の `Date.getDay()` 互換で 0=日, 1=月, ..., 6=土。
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * ブロック時間帯。この時間帯はアクセスを即座にブロックする。
 *
 * - `daysOfWeek` が空配列なら全曜日に適用。
 * - `end < start` のときは日跨ぎ（例 22:00–06:00）として扱う。
 * - `end === start` のときは 24 時間ブロックとして扱う。
 */
export interface BlockedTimeSlot {
  daysOfWeek: DayOfWeek[]
  start: HHMM
  end: HHMM
}

/**
 * 1日の閲覧上限。ブロック時間帯以外の時間に対する1日の累積上限分数。
 *
 * - `daysOfWeek` が空配列なら全曜日に適用。
 * - 同じ曜日に複数エントリが該当する場合、最も厳しい値（最小）を採用する。
 * - `dailyMinutes` は 0 以上の整数（0 は即ブロック）。
 */
export interface TimeLimit {
  daysOfWeek: DayOfWeek[]
  dailyMinutes: number
}

/**
 * グループの動作モード。
 * - `'blacklist'`: patterns にマッチした URL を制限対象とする（既定）。
 * - `'whitelist'`: patterns にマッチしない URL を制限対象とする。
 */
export type GroupMode = 'blacklist' | 'whitelist'

/**
 * ブロック対象グループ。SPEC.md「グループ」節に対応する。
 */
export interface Group {
  /** crypto.randomUUID() で自動採番される一意識別子。 */
  id: string
  /** ユーザー入力の表示名（必須・非空）。 */
  name: string
  /**
   * グループの動作モード。省略時は `'blacklist'`（既存データとの互換のため loadSettings で補完）。
   */
  mode: GroupMode
  /** 正規表現文字列の配列。`new RegExp()` で構文チェックを通る必要がある。 */
  patterns: string[]
  /** ブロック時間帯の配列。この時間帯はアクセスを即座にブロックする。 */
  blockedTimeSlots: BlockedTimeSlot[]
  /** 閲覧上限の配列。ブロック時間帯以外での1日の累積上限。 */
  timeLimits: TimeLimit[]
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

/**
 * 1グループ・1論理日分の閲覧秒数カウンタ。
 */
export interface UsageCounter {
  /** `dailyResetHour` を起点に算出した論理日の識別子。 */
  logicalDate: string
  /** 当該論理日の累積閲覧秒数。 */
  consumedSec: number
}

/**
 * chrome.storage.local に保存する閲覧秒数カウンタ全体。
 */
export interface UsageCountersState {
  /** group id を key とするカウンタ辞書。 */
  counters: Record<string, UsageCounter>
}
