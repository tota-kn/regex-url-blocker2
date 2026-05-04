/**
 * 許可時間帯1つを表す。`end <= start` の場合は日跨ぎとして扱う（例 `22:00–06:00`）。
 */
export interface AllowedHourRange {
  /** 開始時刻 `HH:MM` */
  start: string
  /** 終了時刻 `HH:MM`（排他） */
  end: string
}

/**
 * URL ブロックの単位となるグループ。グループ内の複数正規表現は同じ制限枠を共有する。
 */
export interface Group {
  /** グループの一意 ID（UUID） */
  id: string
  /** 表示名 */
  name: string
  /** マッチ判定に使う正規表現文字列の配列 */
  patterns: string[]
  /** 1日あたりの閲覧上限（分）。`null` で上限なし、`0` で即ブロック */
  dailyTimeLimitMinutes: number | null
  /** 許可時間帯。空配列なら 24 時間 OK */
  allowedHours: AllowedHourRange[]
}

/**
 * 拡張全体のグローバル設定。
 */
export interface GlobalSettings {
  /** ブロック超過時のリダイレクト先 URL */
  redirectUrl: string
  /** 1日のリセット時刻 `HH:MM`（論理日の境界） */
  dailyResetHour: string
}

/**
 * グループごとの当日累積カウンタ。
 */
export interface Accumulator {
  /** カウンタが属する論理日 `YYYY-MM-DD` */
  logicalDate: string
  /** 当日の累積消費秒数 */
  consumedSec: number
}

/**
 * グループ ID → カウンタのマップ。
 */
export type AccumulatorMap = Record<string, Accumulator>

/**
 * ブロックの理由種別。
 */
export type BlockReason = 'time-of-day' | 'daily-limit'

/**
 * グループ単位のブロック判定結果。
 */
export interface GroupBlockDecision {
  blocked: boolean
  reason?: BlockReason
}

/**
 * URL 単位のブロック判定結果。マッチした全グループの ID と、そのうちブロック条件を満たすグループの ID を返す。
 */
export interface UrlBlockDecision {
  blocked: boolean
  matchingGroupIds: string[]
  blockingGroupIds: string[]
}
