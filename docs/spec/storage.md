# ストレージ仕様

この文書は Chrome storage に保存するキー、現行スキーマ、旧データの読み込み互換、壊れた値の扱い、設定 export/import のバージョン互換を定義する。実装上の正規化処理は `utils/storage.ts` と `utils/blocking.ts` に従う。

## `chrome.storage.sync`

`chrome.storage.sync` はユーザーが編集する希望設定を保存する。保存キーは次の2つ。

```ts
{
  global: GlobalSettings
  groups: Group[]
}
```

### `global`

`global` は拡張機能全体の設定を保存する。

```ts
interface GlobalSettings {
  blockAction: 'redirect' | 'blockedPage'
  redirectUrl: string
  dailyResetHour: string
  remainingTimeNotificationsEnabled: boolean
  notificationThresholdMinutes: number
  pageOpenNotificationsEnabled: boolean
  blockNotificationsEnabled: boolean
}
```

- `dailyResetHour` は論理日の境界となる `"HH:MM"`。
- `remainingTimeNotificationsEnabled` は残り時間通知の ON/OFF。
- `notificationThresholdMinutes` は残り時間通知を出す閾値分数。現行スキーマでは1以上の整数。
- `pageOpenNotificationsEnabled` は閲覧上限付き対象ページを開いたときの通知の ON/OFF。
- `blockNotificationsEnabled` は redirect ブロック発動通知の ON/OFF。
- `blockAction` と `redirectUrl` は現行のブロック判定ではグループ側を使う。旧データ互換と新規グループ初期値のため `global` にも保持する。

`global` が未設定、または一部フィールドが欠損している場合は `DEFAULT_GLOBAL_SETTINGS` で補完する。現在の既定値は次の通り。

```ts
{
  blockAction: 'blockedPage',
  redirectUrl: 'https://example.com',
  dailyResetHour: '03:00',
  remainingTimeNotificationsEnabled: true,
  notificationThresholdMinutes: 5,
  pageOpenNotificationsEnabled: true,
  blockNotificationsEnabled: true,
}
```

### `groups`

`groups` はブロック対象グループの配列を保存する。

```ts
interface Group {
  id: string
  name: string
  mode: 'blacklist' | 'whitelist'
  lockMode: boolean
  patterns: string[]
  blockAction: 'redirect' | 'blockedPage'
  redirectUrl: string
  scheduleRules: ScheduleRule[]
}

type ScheduleRuleCondition =
  | { type: 'daily' }
  | { type: 'weekly', daysOfWeek: number[] }   // 0=日〜6=土
  | { type: 'monthly', daysOfMonth: number[] } // 1〜31
  | { type: 'period', start: MonthDay, end: MonthDay } // 両端含む・年跨ぎ可

interface ScheduleRule {
  id: string
  condition: ScheduleRuleCondition
  blockedTimeRanges: TimeRange[]
  dailyLimitMinutes?: number
}
```

- `id` はグループ識別子。
- `name` は表示名。
- `mode` は `blacklist` の場合 `patterns` にマッチした URL を制限対象にし、`whitelist` の場合 `patterns` にマッチしない URL を制限対象にする。
- `lockMode` が `true` のグループは、設定変更が次回 daily reset まで有効設定へ反映されない。
- `patterns` は URL 判定に使う文字列配列。
- `blockAction` と `redirectUrl` が現行のグループ別ブロック先。
- `scheduleRules` は条件付きの制限ルール配列。空配列は制限なし。詳細は `docs/spec/domain.md`「グループ」節を参照。

`groups` が配列でない場合は空配列として読み込む。

### 読み込み互換と正規化

`loadSettings()` は保存済み値をそのまま信用せず、次の規則で `Settings` へ正規化する。

- `global` が未設定またはオブジェクトでない場合は空オブジェクトとして扱い、`DEFAULT_GLOBAL_SETTINGS` で補完する。
- `global.blockAction` が `'redirect'` / `'blockedPage'` 以外の場合は既定値に戻す。
- `global.redirectUrl` が文字列でない場合は既定値に戻す。
- `global.notificationThresholdMinutes` が1以上の整数でない場合は既定値に戻す。
- 旧データの `global.notificationThresholdMinutes: 0` は残り時間通知 OFF を意味していたため、`remainingTimeNotificationsEnabled: false` として読み込む。この場合も `notificationThresholdMinutes` 自体は既定値へ正規化する。
- `remainingTimeNotificationsEnabled` が boolean でない場合は、旧 `notificationThresholdMinutes: 0` でない限り `true` として扱う。
- `pageOpenNotificationsEnabled` / `blockNotificationsEnabled` が boolean でない場合は既定値で補完する。
- `groups` が配列でない場合は `[]` として扱う。
- グループの `id` が文字列でない場合は `crypto.randomUUID()` で補完する。
- グループの `name` が文字列でない場合は空文字で補完する。
- 旧グループで `mode` が欠損、または不正な場合は `blacklist` で補完する。`whitelist` は保持する。
- 旧グループで `lockMode` が欠損、または `true` 以外の場合は `false` で補完する。
- グループの `patterns` が配列でない場合は `[]` として扱い、配列内の非文字列値は除外する。
- 旧グループで `blockAction` / `redirectUrl` が欠損している場合は `global.blockAction` / `global.redirectUrl` から補完する。`global` 側にも有効な値がない場合は既定値で補完する。
- `scheduleRules` の正規化：
  - `scheduleRules` が配列の場合は各要素を正規化する。`condition.type` が既知の4種（`daily` / `weekly` / `monthly` / `period`）以外の要素は破棄する（background が解釈不能な条件を持たないようにするため）。`id` 欠損は `crypto.randomUUID()` で補完し、`blockedTimeRanges` 非配列は `[]`、`dailyLimitMinutes` は number 以外なら未定義にする。
  - `scheduleRules` が無く旧 `dailyRules`（曜日別ルール配列）がある場合は自動変換する。制限のある曜日を「同一の `blockedTimeRanges` / `dailyLimitMinutes`」ごとにグルーピングし、`weekly` ルール1件ずつへ変換する。全曜日が同一内容なら `daily` ルール1件にまとめる。制限のない曜日はルールを生成しない。
  - `scheduleRules` も `dailyRules` も無い、またはそれ以前の旧 `schedules` / `blockedTimeSlots` / `timeLimits` しかない場合は空の `scheduleRules` を生成し、旧フィールドは破棄する。

読み込み互換は「Service Worker や options/popup を停止させない」ことを優先する。保存 UI や import は別途 validation を行うため、読み込み時に補完された値がそのままユーザー編集後に保存されるとは限らない。

## `chrome.storage.local`

`chrome.storage.local` は runtime 状態とキャッシュを保存する。壊れた値は可能な範囲で除外し、壊れた1エントリが Service Worker 全体を停止させない方針とする。

### `effectiveSettings` / `effectiveSettingsLogicalDate`

```ts
{
  effectiveSettings: Settings
  effectiveSettingsLogicalDate: string
}
```

`effectiveSettings` は URL 判定、badge、counter 加算に使う有効設定スナップショット。`lockMode` グループがある場合、希望設定と有効設定が次回 daily reset まで一時的に異なることがある。

- `effectiveSettings` が未設定、オブジェクトでない、または配列の場合は、`chrome.storage.sync` から読んだ希望設定を現在時刻の有効設定として作り直す。
- `effectiveSettings` がオブジェクトの場合は `loadSettings()` と同じ規則で正規化する。
- `effectiveSettingsLogicalDate` が文字列でない場合は、fallback の希望設定と現在時刻から算出した論理日で補完する。

### `counters`

```ts
{
  counters: Record<string, {
    logicalDate: string
    consumedSec: number
  }>
}
```

`counters` は group id ごとの閲覧秒数カウンタ。

- 未設定、オブジェクトでない、または配列の場合は `{ counters: {} }` として読み込む。
- 各エントリで `logicalDate` が文字列でない場合は除外する。
- 各エントリで `consumedSec` が finite number でない場合は除外する。
- `consumedSec` は `Math.floor()` し、負値は0へ丸める。
- background 初期化・設定再読み込み・local storage 変更取り込み時に、現在の有効設定に存在するグループだけへ正規化する。
- 論理日が現在論理日と異なるカウンタは、現在論理日の `consumedSec: 0` として正規化する。
- 同一論理日のカウンタをメモリ状態と保存済み状態で統合する場合は、大きい `consumedSec` を優先する。
- 削除済みグループのカウンタは正規化後に残さない。background のフラッシュ時に破棄されてよい。

background はカウンタをメモリ上に保持し、約7秒間隔、heartbeat アラーム、`runtime.onSuspend` で `storage.local` へフラッシュする。

### `groupPauseState`

```ts
{
  groupPauseState: Record<string, {
    waitingUntil?: number
    pausedUntil?: number
  }>
}
```

`groupPauseState` は group id ごとの一時停止状態。1回目のクリックで `waitingUntil` を保存し、`waitingUntil` 経過後の再クリックで `pausedUntil` を保存する。`pausedUntil` が現在時刻より未来のグループはブロック判定の `blockedGroupIds` からだけ除外する。`targetGroupIds` は変えないため、daily limit の閲覧秒数カウンタ加算は一時停止中も継続する。

- 未設定、オブジェクトでない、または配列の場合は空状態として読み込む。
- 各エントリで値がオブジェクトでない、または配列である場合はそのエントリだけ除外する。
- `waitingUntil` が finite number かつ正値でない場合は除外する。過去の `waitingUntil` は「10分一時停止を開始できる状態」として保持する。
- `pausedUntil` が finite number でない、または現在時刻以前の場合は除外する。
- background 初期化・設定再読み込み時に、現在の有効設定に存在するグループだけへ正規化する。
- 削除済みグループの一時停止状態は正規化後に残さない。
- 一時停止状態は runtime 状態であり、設定 export/import には含めない。

### `usageNotificationHistory`

```ts
{
  usageNotificationHistory: Record<string, { logicalDate: string }>
}
```

残り時間通知を同一グループ・同一論理日に重複表示しないための履歴。

- 未設定、オブジェクトでない、または配列の場合は空履歴として読み込む。
- 各エントリで値がオブジェクトでない、配列である、または `logicalDate` が文字列でない場合はそのエントリだけ除外する。

### `pageOpenNotificationHistory`

```ts
{
  pageOpenNotificationHistory: Record<string, { logicalDate: string }>
}
```

閲覧上限付き対象ページを開いたときの通知を同一グループ・同一論理日に重複表示しないための履歴。壊れた値の扱いは `usageNotificationHistory` と同じ。

### `blockNotificationHistory`

```ts
{
  blockNotificationHistory: Record<string, { logicalDate: string }>
}
```

redirect ブロック発動通知を同一グループ・同一論理日に重複表示しないための履歴。壊れた値の扱いは `usageNotificationHistory` と同じ。

## 設定 export/import

設定 export ファイルは次の JSON 形式。

```ts
{
  version: 5,
  settings: Settings
}
```

- export は常に `version: 5` を出力する。
- import は互換のため `version: 2` / `3` / `4` / `5` を受け付ける。
- 不正 JSON は `Invalid JSON` として拒否する。
- `version` が未対応の場合は `Unsupported settings file version` として拒否する。
- `settings` が欠損、オブジェクトでない、または配列の場合は拒否する。
- `settings.global` が欠損、オブジェクトでない、または配列の場合は拒否する。
- `settings.groups` が配列でない場合は拒否する。
- JSON から `Settings` へ正規化したあと、`validateGlobalSettings()` と `validateGroup()` で validation error が1件でもあれば拒否する。
- v2 import では、グループ側に `blockAction` / `redirectUrl` がない旧データを `global.blockAction` / `global.redirectUrl` から補完する。
- v2〜v4 import では、グループ側の旧 `dailyRules` を上記の正規化規則で `scheduleRules` へ自動変換する。
- v5 import では、グループ側の `scheduleRules` をそのまま正規化して保持する。

## 新フィールド追加時の方針

新しい保存フィールドを追加する場合は、次の方針に従う。

- `chrome.storage.sync` の希望設定に追加するフィールドは、既存データで欠損しても既定値で補完できる形にする。
- import/export の後方互換が必要な場合は、`version` を上げ、旧 version の読み込み補完ルールをこの文書に追記する。
- `chrome.storage.local` の runtime 状態は壊れた値を個別に除外できる形にし、読み込み失敗で Service Worker の初期化を止めない。
