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

/** 制限を適用する時間条件。`always` は明示的な常時適用ウィンドウ。 */
export type TimeWindow =
  | { type: 'always' }
  | { type: 'scheduled'; condition: ScheduleRuleCondition; timeRanges: TimeRange[] }

/**
 * 制限が発動してアクセスを禁止するときの遷移先。
 * `'blockedPage'` は拡張機能のブロックページ、`'redirect'` は指定 URL。
 */
export type BlockDestination = { type: 'blockedPage' } | { type: 'redirect'; url: string }

/**
 * Rule が課す制限の種別。遷移先は含まない。
 * 評価はこの順（`RULE_KIND_ORDER`）で行い、最初に成立したものが勝つ。
 * - `'block'`: 有効ウィンドウ中は常にアクセスを禁止する。
 * - `'sessionLimit'`: 最初のアクセスから一定時間だけ許可し、その後は休憩としてブロックする。
 * - `'dailyLimit'`: 有効ウィンドウ中の閲覧秒数を積算し、1日の上限分数に達するとブロックする。
 * - `'wait'`: アクセス前に待機ゲート（カウントダウン）を課す。ブロックはしない。
 */
export type RuleKind = 'block' | 'sessionLimit' | 'dailyLimit' | 'wait'

/**
 * Rule が課す制限内容。遷移先は含まず、種別ごとに必要な値だけを持つ。
 */
export type RuleRestriction =
  | { kind: 'block' }
  | { kind: 'sessionLimit'; sessionMinutes: number; breakMinutes: number }
  | { kind: 'dailyLimit'; minutes: number }
  | { kind: 'wait'; seconds: number; grantMinutes: number }

/**
 * 「いつ」と「何を」を1対1で束ねた制限ルール。
 */
export interface Rule {
  /** ルールの一意識別子。 */
  id: string
  /** このルールを適用する時間条件。 */
  window: TimeWindow
  /** このルールが課す制限内容。 */
  restriction: RuleRestriction
  /** アクセス禁止が発動したときの遷移先。`kind === 'wait'` では使わない。 */
  destination?: BlockDestination
}

/**
 * グループの動作モード。
 * - `'blacklist'`: patterns にマッチした URL を制限対象とする（既定）。
 * - `'whitelist'`: patterns にマッチしない URL を制限対象とする。
 */
export type GroupMode = 'blacklist' | 'whitelist'

/**
 * ブロック対象グループ。
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
  /** 一時停止を開始するまでの待機秒数。0以上の整数。 */
  pauseWaitSeconds?: number
  /** 一時停止を継続する分数。1以上の整数。 */
  pauseDurationMinutes?: number
  /** false の場合、このグループの一時停止（Pause）操作を禁止する。既定は true。 */
  pauseAllowed: boolean
  /**
   * このグループに設定する制限ルールの配列。
   * `loadSettings` が常に `RULE_KIND_ORDER` の評価順へ並べ替えて返す。
   */
  rules: Rule[]
}

/**
 * 拡張機能全体のグローバル設定。
 */
export interface GlobalSettings {
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
  /** 1回目クリック後、一時停止を開始できる時刻の epoch milliseconds。 */
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

/** 1グループ分の利用枠開始状態。 */
export interface SessionLimitEntry {
  /** 対象サイトを最初に開いた epoch milliseconds。 */
  startedAt: number
}

/** chrome.storage.local に保存する利用枠・休憩状態。 */
export interface SessionLimitState {
  /** group id を key とする利用枠開始状態。 */
  sessionLimitState: Record<string, SessionLimitEntry>
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
