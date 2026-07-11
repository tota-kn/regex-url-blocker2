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
 * 毎年繰り返す月日（1始まり）。
 */
export interface MonthDay {
  /** 月。1-12。 */
  month: number
  /** 日。1-31。 */
  day: number
}

/**
 * スケジュールルールの適用条件。論理日単位で判定する。
 * - `'daily'`: 毎日。
 * - `'weekly'`: 指定曜日。
 * - `'monthly'`: 毎月の指定日。
 * - `'period'`: 毎年繰り返す期間（両端含む・年跨ぎ可・start===end は単日）。
 */
export type ScheduleRuleCondition =
  | { type: 'daily' }
  | { type: 'weekly'; daysOfWeek: DayOfWeek[] }
  | { type: 'monthly'; daysOfMonth: number[] }
  | { type: 'period'; start: MonthDay; end: MonthDay }

/**
 * グループに設定できる制限の種別。
 * - `'block'`: 有効ウィンドウ中は常にアクセスを禁止し、拡張機能のブロックページを表示する。
 * - `'redirect'`: 有効ウィンドウ中は常にアクセスを禁止し、指定 URL へ遷移させる。
 * - `'grace'`: 有効ウィンドウ中の閲覧秒数を積算し、1日の上限分数に達するとブロックする。
 * - `'wait'`: 有効ウィンドウ中、アクセス前に待機ゲート（カウントダウン）を課す。
 */
export type RestrictionType = 'block' | 'redirect' | 'grace' | 'wait'

/** 制限を適用する時間条件。`always` は明示的な常時適用ウィンドウ。 */
export type TimeWindow =
  | { type: 'always' }
  | { type: 'scheduled'; condition: ScheduleRuleCondition; timeRanges: TimeRange[] }

/** 時間条件から独立して設定する制限内容。 */
export interface Restriction {
  /** 制限種別。 */
  type: RestrictionType
  /** `type === 'grace'` のときの1日の閲覧上限分数。 */
  graceMinutes?: number
  /** `type === 'wait'` のときのアクセス前待機秒数。 */
  waitSeconds?: number
  /** `type === 'redirect'` のときの遷移先 URL。 */
  redirectUrl?: string
}

/**
 * グループに設定する1件の制限ルール。
 * `condition` と `timeRanges` は制限が有効になる「有効ウィンドウ」を表し、
 * ウィンドウが有効な間だけ `type` に応じた制限（禁止・猶予・待機）を適用する。
 */
export interface RestrictionRule {
  /** 適用する日の条件。既存の `ScheduleRuleCondition` を再利用する。 */
  condition: ScheduleRuleCondition
  /** 制限が有効な時刻ウィンドウ。空配列は終日有効。 */
  timeRanges: TimeRange[]
  /** 制限種別。 */
  type: RestrictionType
  /** `type === 'grace'` のときの1日の閲覧上限分数。0以上の整数。 */
  graceMinutes?: number
  /** `type === 'wait'` のときのアクセス前待機秒数。0以上の整数。 */
  waitSeconds?: number
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
 * ブロック対象グループ。docs/spec/domain.md「グループ」節に対応する。
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
  /** true の場合、このグループは URL 判定・counter・通知の対象から除外する。 */
  disabled: boolean
  /** true の場合、制限を緩和する変更は次回 daily reset まで基準設定と併用する。 */
  lockMode: boolean
  /** URL pattern の配列。裸ドメインまたは `new RegExp()` で構文チェックを通る正規表現を指定できる。 */
  patterns: string[]
  /** ブロック発生時のこのグループの遷移先種別。 */
  blockAction: BlockAction
  /** このグループで redirect を選んだ場合の遷移先 URL。 */
  redirectUrl: string
  /** このグループに設定する時間ウィンドウの配列。 */
  timeWindows?: TimeWindow[]
  /** このグループに設定する制限の配列。 */
  restrictions?: Restriction[]
  /** @deprecated v9 移行用の旧ペア形式。読み込み時に分離形式へ変換する。 */
  restrictionRules?: RestrictionRule[]
  /** @deprecated v7 移行用の旧単一制限。 */
  restriction?: RestrictionRule
}

/**
 * 拡張機能全体のグローバル設定。docs/spec/domain.md「グローバル設定」節に対応する。
 */
export interface GlobalSettings {
  /** ブロック発生時の遷移先種別。 */
  blockAction: BlockAction
  /** 制限超過時のリダイレクト先 URL。 */
  redirectUrl: string
  /** 論理日の境界となる時刻（"HH:MM"）。 */
  dailyResetHour: HHMM
  /** 残り閲覧時間通知を有効にするか。 */
  remainingTimeNotificationsEnabled: boolean
  /** 残り閲覧時間通知を出す閾値分数。 */
  notificationThresholdMinutes: number
}

/**
 * chrome.storage.sync に保存される全体構造のミラー。
 */
export interface Settings {
  global: GlobalSettings
  groups: Group[]
}

/**
 * chrome.storage.local に保存される、現在の rule day の制限基準スナップショット。
 */
export interface EffectiveSettingsState {
  /** 最新設定と独立評価し、厳しい結果を採用するための基準設定。 */
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
 * 1グループ分の一時停止状態。
 */
export interface GroupPauseEntry {
  /** 1回目クリック後、10分一時停止を開始できる時刻の epoch milliseconds。 */
  waitingUntil?: number
  /** この時刻までブロックだけを一時停止する epoch milliseconds。 */
  pausedUntil?: number
}

/**
 * chrome.storage.local に保存するグループ一時停止状態。
 */
export interface GroupPauseState {
  /** group id を key とする一時停止状態辞書。 */
  groupPauseState: Record<string, GroupPauseEntry>
}

/**
 * 1グループ分の待機ゲート通過後のアクセス許可状態。
 */
export interface DelayGrantEntry {
  /** この時刻まで待機ゲートを免除しアクセスを許可する epoch milliseconds。 */
  grantedUntil: number
}

/**
 * chrome.storage.local に保存する待機ゲートのアクセス許可状態。
 */
export interface DelayGrantState {
  /** group id を key とする待機ゲート許可状態辞書。 */
  delayGrantState: Record<string, DelayGrantEntry>
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
