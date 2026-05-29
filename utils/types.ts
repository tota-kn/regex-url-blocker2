/**
 * 曜日番号。JS の `Date.getDay()` 互換で 0=日, 1=月, ..., 6=土。
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * "HH:MM" 形式の時刻文字列。0 埋め2桁（例 "09:30"）。
 */
export type HHMM = string

/**
 * 分単位のブロック時間帯。
 * `startMinute === endMinute` のときは24時間ブロックとして扱う。
 */
export interface TimeRange {
  /** 開始分。0 が 00:00、1440 が 24:00。 */
  startMinute: number
  /** 終了分。0 が 00:00、1440 が 24:00。 */
  endMinute: number
}

/**
 * 1曜日分の制限ルール。
 */
export interface DailyRule {
  /** JS Date 互換の曜日番号。 */
  dayOfWeek: DayOfWeek
  /** この曜日に即ブロックする時間帯。 */
  blockedTimeRanges: TimeRange[]
  /** 1日の閲覧上限分数。undefined は上限なし、0 は即ブロック。 */
  dailyLimitMinutes?: number
}

/**
 * グループの動作モード。
 * - `'blacklist'`: patterns にマッチした URL を制限対象とする（既定）。
 * - `'whitelist'`: patterns にマッチしない URL を制限対象とする。
 */
export type GroupMode = 'blacklist' | 'whitelist'

/**
 * ブロック発生時の遷移先。
 * - `'redirect'`: ユーザー指定 URL へ遷移する（既定）。
 * - `'blockedPage'`: 拡張機能が用意するブロックページを表示する。
 */
export type BlockAction = 'redirect' | 'blockedPage'

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
  /** true の場合、このグループの設定変更は次回 daily reset まで有効設定へ反映しない。 */
  lockMode: boolean
  /** URL pattern の配列。裸ドメインまたは `new RegExp()` で構文チェックを通る正規表現を指定できる。 */
  patterns: string[]
  /** ブロック発生時のこのグループの遷移先種別。 */
  blockAction: BlockAction
  /** このグループで redirect を選んだ場合の遷移先 URL。 */
  redirectUrl: string
  /** 曜日別の制限ルール。0=日曜から6=土曜まで必ず7件。 */
  dailyRules: DailyRule[]
}

/**
 * 拡張機能全体のグローバル設定。SPEC.md「グローバル設定」節に対応する。
 */
export interface GlobalSettings {
  /** ブロック発生時の遷移先種別。 */
  blockAction: BlockAction
  /** 制限超過時のリダイレクト先 URL。 */
  redirectUrl: string
  /** 論理日の境界となる時刻（"HH:MM"）。 */
  dailyResetHour: HHMM
  /** 残り閲覧時間通知を出す閾値分数。0 は通知無効。 */
  notificationThresholdMinutes: number
  /** 閲覧上限付き対象ページを開いたときの通知を有効にするか。 */
  pageOpenNotificationsEnabled: boolean
  /** redirect によるブロック発動時の通知を有効にするか。 */
  blockNotificationsEnabled: boolean
}

/**
 * chrome.storage.sync に保存される全体構造のミラー。
 */
export interface Settings {
  global: GlobalSettings
  groups: Group[]
}

/**
 * chrome.storage.local に保存される、現在 background 判定に使う有効設定スナップショット。
 */
export interface EffectiveSettingsState {
  /** 現在の URL 判定・badge・counter 加算に使う設定。 */
  effectiveSettings: Settings
  /** `effectiveSettings.global.dailyResetHour` で算出した保存時点の論理日。 */
  effectiveSettingsLogicalDate: string
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

/**
 * 1グループの残り時間通知済み状態。
 */
export interface UsageNotificationEntry {
  /** 最後に通知した論理日。 */
  logicalDate: string
}

/**
 * chrome.storage.local に保存する残り時間通知履歴。
 */
export interface UsageNotificationHistoryState {
  /** group id を key とする通知済み論理日辞書。 */
  usageNotificationHistory: Record<string, UsageNotificationEntry>
}

/**
 * chrome.storage.local に保存する対象ページ表示通知履歴。
 */
export interface PageOpenNotificationHistoryState {
  /** group id を key とする通知済み論理日辞書。 */
  pageOpenNotificationHistory: Record<string, UsageNotificationEntry>
}

/**
 * chrome.storage.local に保存する redirect ブロック通知履歴。
 */
export interface BlockNotificationHistoryState {
  /** group id を key とする通知済み論理日辞書。 */
  blockNotificationHistory: Record<string, UsageNotificationEntry>
}
