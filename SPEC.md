# 仕様

URL pattern で指定した URL に対して **1日あたりの閲覧時間** と **時間帯** を制限する Chrome 拡張機能。制限を超過すると別途設定したリダイレクト URL（デフォルト `https://example.com`）へ遷移するか、拡張機能が用意するブロックページを表示する。

## 用語

- **グループ** — 制限を共有する URL pattern の集合。第一級のエンティティ。
- **URL pattern** — 裸ドメインまたは正規表現。裸ドメインは対象ドメイン本体とサブドメインの全ページに一致する。
- **正規表現** — URL 文字列全体に対して部分一致を行うパターン。JS の `RegExp` 構文。
- **論理日** — グローバル設定の「リセット時刻」を起点とする1日。`floor((now - resetHour) / 24h)` で算出。
- **消費秒数** — グループ単位で計測される、1日に該当グループの URL を閲覧した累積秒数。
- **ブロック時間帯** — アクセスを即座にブロックする時間帯。曜日ごとの分単位範囲として定義する。
- **上限** — ブロック時間帯以外の時間に対する1日の累積閲覧上限（分）。曜日ごとに設定可能。

## 機能要件

### グループ

- 各グループは以下の属性を持つ：
  - `id`: UUID（自動採番）
  - `name`: ユーザー入力の表示名（必須）
  - `mode`: 対象 URL の判定モード。`blacklist`（既定）または `whitelist`
  - `lockMode`: `true` の場合、このグループの変更は次回 daily reset まで有効設定へ反映しない。既定 `false`
  - `patterns`: URL pattern 文字列の配列
  - `dailyRules`: 曜日別ルールの配列。0=日曜から6=土曜まで必ず7件
- `mode` の意味：
  - `blacklist`: `patterns` のいずれかにマッチした URL を制限対象とする
  - `whitelist`: `patterns` のいずれにもマッチしない URL を制限対象とする
  - 旧データなどで `mode` が欠損している場合は `blacklist` として扱う
- 各 `dailyRules[]` は以下の属性を持つ：
  - `dayOfWeek`: 0=日, 1=月, ..., 6=土（JS `Date.getDay()` 互換）
  - `blockedTimeRanges`: ブロック時間帯の配列。各要素は `startMinute` / `endMinute`（0..1440）。`endMinute < startMinute` なら日跨ぎ、`endMinute === startMinute` なら 24 時間ブロック
  - `dailyLimitMinutes`: 1日あたり閲覧上限（分）。未定義なら上限なし、`0` で「即ブロック」を表現
- グループは追加順に表示する（v1 では並び替え非対応）。
- 曜日判定は **論理日切り替え時点の曜日**（リセット時刻起点）で行う。
- 各グループはブロック時の遷移先設定を持つ：
  - `blockAction`: `redirect` または `blockedPage`（既定）
  - `redirectUrl`: `blockAction === "redirect"` の場合のリダイレクト先 URL。デフォルト `https://example.com`

### グローバル設定

- `dailyResetHour`: 論理日の境界となる時刻（`HH:MM`）。デフォルト `03:00`
- `remainingTimeNotificationsEnabled`: 残り閲覧時間通知を有効にする。デフォルト `true`
- `notificationThresholdMinutes`: 残り閲覧時間通知を出す閾値（分）。デフォルト `5`。1以上の整数
- `pageOpenNotificationsEnabled`: 閲覧上限付き対象ページを開いたときの通知を有効にする。デフォルト `true`
- `blockNotificationsEnabled`: `redirect` によるブロック発動時の通知を有効にする。デフォルト `true`

### 閲覧時間の計測

- 1秒ごとに加算する。
- 加算条件は **すべて** 満たすこと：
  - ブラウザウィンドウがフォーカスされている
  - アクティブタブが対象グループの URL pattern にマッチする
  - `chrome.idle` の状態が `active`（5分無操作で停止）
- 同じ URL を複数タブで同時に開いていても、**1秒あたり1回** の加算（アクティブタブのみが意味を持つ）。
- 1つの URL が複数グループの URL pattern にマッチした場合、**マッチしたすべてのグループ** に並列で1秒加算する。
- `whitelist` グループでは、URL pattern にマッチしない URL が「対象グループに該当」とみなされるため、その URL を閲覧している間は同様に1秒加算する。

### ブロック判定

- グループ単位の判定式（時刻 T、曜日 D）：
  - まず URL が対象グループに該当するかを `mode` と `patterns` で判定する。該当しないグループは許可状態
  - D に該当する `dailyRules[]` を1件取得する
  - `blockedTimeRanges` が空で `dailyLimitMinutes` も未定義なら、そのグループは常に許可状態
  - `blockedTimeRanges` のうち T が `[startMinute, endMinute)` に含まれるものが1つでも存在 → ブロック状態
  - `dailyLimitMinutes` が定義されており、`consumedSec >= dailyLimitMinutes * 60` ならブロック状態
- URL 単位の判定：
  - URL がマッチするグループのうち **いずれか1つでもブロック状態** なら、その URL はブロックされる
- ブロックされた URL は、ブロック状態だったグループのうち Options 画面の表示順で最初のグループの `blockAction` に従って、当該グループの `redirectUrl` へリダイレクトされるか拡張機能のブロックページへ遷移する。

### URL pattern の評価対象

- 裸ドメイン（例: `example.com`）は、URL の hostname がそのドメイン本体またはサブドメインなら「マッチ」とする。
- 裸ドメイン以外は正規表現として扱い、`tab.url` 全体（scheme・パス・クエリ・フラグメントを含む）に対して部分一致すれば「マッチ」とする。
- URL pattern は Options 保存時に「裸ドメインとして妥当、または `new RegExp()` で構文解析可能」であることを検証する。background は壊れた保存データに含まれる無効な正規表現を無視し、Service Worker 全体を停止させない。
- 以下の URL は判定スキップ（=絶対にリダイレクトしない）：
  - `chrome://`、`chrome-extension://`、`about:`、`file://` で始まる URL
  - 全グループの `redirectUrl` と完全一致する URL（無限ループ防止）

### リセット仕様

- 1日のリセット時刻はグローバルに1つ。
- 論理日が切り替わったタイミングで `consumedSec` を 0 に上書き。
- 過去日の履歴は保持しない（今日分のみ）。
- 日跨ぎのブロック時間帯は `end < start` で表現する（例 `22:00–06:00`）。`end === start` は 24 時間ブロックとして扱う。

### ブロック時の遷移動作

- 新規ナビゲーション：`chrome.webNavigation.onBeforeNavigate`（および SPA 用 `onHistoryStateUpdated`）で先回り判定し、`chrome.tabs.update` でブロック先 URL へ書き換える。
- `webNavigation` はトップレベルフレームのみを対象とし、`frameId !== 0` のイベントは無視する。
- 既存タブの状態変化：`tabs.onUpdated`、`tabs.onActivated`、`windows.onFocusChanged`、`chrome.alarms`（1分間隔）と毎秒ティックで再評価し、ブロック状態に切り替わったタブを `tabs.update` で書き換える。
- `tabs.update` の直前にも判定スキップ URL と全グループの `redirectUrl` 完全一致を確認し、リダイレクトループを防止する。
- 採用グループの `blockAction === "redirect"` の場合は、そのグループの `redirectUrl` へ遷移する。
- 採用グループの `blockAction === "blockedPage"` の場合は `blocked.html` を表示し、ブロックされた URL とブロック状態だったグループ名を表示する。

### 設定変更の反映タイミング

- ユーザーが保存した設定は `chrome.storage.sync` に「希望設定」として保存する。
- background は `chrome.storage.local` に「有効設定スナップショット」を保持し、URL 判定・badge・counter 加算にはこの有効設定を使う。
- `lockMode: false` のグループは、追加・編集・削除を同じ論理日中でも希望設定どおり即時反映する。
- `lockMode: true` のグループは、有効設定側のグループスナップショットを次回リセット時刻まで維持する。`patterns`、`mode`、`dailyRules`、`name`、`lockMode` の OFF、グループ削除はいずれも次回リセットで希望設定全体が昇格したときに反映する。
- 有効設定に存在しない新規グループは即時反映する。新規グループを `lockMode: true` で保存した場合、初回保存は即時有効化され、その後の変更が次回リセットまで保留される。
- `remainingTimeNotificationsEnabled`、`notificationThresholdMinutes`、`pageOpenNotificationsEnabled`、`blockNotificationsEnabled` は同じ論理日中でも希望設定を即時反映する。グループ別の `blockAction` と `redirectUrl` はグループ設定として反映タイミングに従う。
- 希望設定または有効設定のどちらかに `lockMode: true` のグループがある間、`dailyResetHour` は変更できず、現在有効なリセット時刻を維持する。
- 論理日が切り替わったタイミングで、希望設定全体を有効設定へ昇格する。

### 残り時間通知・Action Badge

- `remainingTimeNotificationsEnabled` が `true` かつ現在の active tab が閲覧上限付きグループの対象 URL で、残り時間が `notificationThresholdMinutes` 分以下かつ 0 秒より大きい場合、Chrome notification を表示する。
- 残り時間通知はグループごと・論理日ごとに1回だけ表示する。
- 通知本文は対象グループ名と当日残り分数を表示する。
- `notificationThresholdMinutes` は残り時間通知だけに適用する。
- `pageOpenNotificationsEnabled` が `true` の場合、`webNavigation.onBeforeNavigate` / `onHistoryStateUpdated` / `tabs.onUpdated` の URL 評価時に、判定スキップ対象ではなく、当日の `dailyLimitMinutes` が定義されたグループに該当し、かつまだブロック状態ではない URL について Chrome notification を表示する。
- 対象ページ通知はグループごと・論理日ごとに1回だけ表示する。複数グループに該当した場合は1件の通知にまとめ、通知済み扱いは該当した各グループに記録する。
- `blockNotificationsEnabled` が `true` かつ採用グループの `blockAction === "redirect"` の場合、時間帯ブロックまたは上限到達ブロックにより `tabs.update` でそのグループの `redirectUrl` へ遷移する直前に Chrome notification を表示する。
- redirect ブロック通知はグループごと・論理日ごとに1回だけ表示する。複数ブロックグループに該当した場合は1件の通知にまとめ、通知済み扱いは該当した各グループに記録する。
- 採用グループの `blockAction === "blockedPage"` の場合はブロックページ上で理由が分かるため、redirect ブロック通知は表示しない。
- action badge は、現在タブの対象グループのうち当日残り時間が最も短い上限を分単位切り上げ（例 `5m`）で表示する。
- action badge の色は通常時が青、残り5分以下が警告色、残り0秒がブロック色。
- 対象 URL に当日上限がない場合、action badge は空にする。

## 画面要件

### Options 画面（編集）

- グループの追加・編集・削除
- 各グループ：`name`、`mode`、`lockMode`、`patterns[]`、`blockAction`、`redirectUrl`、`dailyRules[]`
- `mode` は `blacklist` / `whitelist` を選択できる。
- ブロック時間帯は曜日ごとに `HH:MM-HH:MM` のカンマ区切りテキスト、または30分グリッドで編集する。終了時刻には `24:00` を指定できる
- 上限は曜日ごとに上限分数を入力する。空欄なら上限なし
- 制限テンプレートとして「Blank group」「Core SNS 15 min/day」「Video 30 min/day」「Work hours focus」を新規グループ作成時に選択できる
- グローバル設定（`dailyResetHour`、`remainingTimeNotificationsEnabled`、`notificationThresholdMinutes`、`pageOpenNotificationsEnabled`、`blockNotificationsEnabled`）の編集
- グループの `blockAction === "redirect"` の場合のみ `redirectUrl` を入力・検証する
- Lock Mode group が存在する間は `dailyResetHour` 入力を無効化し、変更できない理由を表示する
- 保存時に URL pattern を検証し、無効なら保存拒否＋インラインエラー
- 保存はキー入力のたびではなく debounce（300ms）で `chrome.storage.sync` のレート制限に配慮
- グループカードは通常は読み取り表示で、編集ボタンから編集モードに入る。グループ単位で保存・キャンセルできる
- 未保存の新規グループはキャンセルで破棄できる
- グループ削除時は確認ダイアログを表示する
- Lock Mode ON のグループに未反映の保存済み変更がある場合、Options 画面に「未反映の保存済み変更」と次回反映時刻を表示する
- 未反映差分がある場合、現在 blocking に使われている有効設定を読み取り専用ダイアログで確認できる
- 設定は JSON ファイルとしてエクスポート／インポートできる。インポートは全グループとグローバル設定を置換し、スキーマバージョンと内容を検証する

### Popup 画面（状況表示・読み取り専用）

- 現在のタブ URL を有効設定で評価し、対象グループのうち当日上限があるグループを表示する
- 拡張機能ページ上で popup を開いた場合は、同一ウィンドウ内の判定対象タブを代替表示対象として探す
- 表示対象ごとに：`name`、残り時間、`消費 / 上限`（`M:SS / 30:00` 形式）、進捗メーター
- 判定スキップ URL の場合は「This page is excluded from blocking.」を表示する
- 対象グループがない場合は「No matching groups for this page.」を表示する
- 対象グループはあるが当日上限がない場合は「No daily limits apply to this page.」を表示する
- 「Options」ボタンから設定画面を開ける
- 1秒間隔で再描画（`onUnmounted` でタイマー解除）

### Blocked 画面

- 採用グループの `blockAction === "blockedPage"` の場合、`blocked.html` を表示する。
- query string の `url` にブロックされた URL、`group` にブロック状態だった group id を複数指定する。
- 画面にはブロックされた URL と、現在の有効設定から解決したブロックグループ名を表示する。
- 該当グループが有効設定に存在しない場合は `Unknown setting` と表示する。
- `Back` ボタンはブラウザ履歴の直前ページへ戻る。

## ストレージ

- `chrome.storage.sync`：グループ定義（ブロック時動作、リダイレクト先を含む）、グローバル設定（リセット時刻、残り時間通知閾値、対象ページ通知設定、redirect ブロック通知設定）
- `chrome.storage.local`：
  - グループごとの累積カウンタ（`{ counters: Record<groupId, { logicalDate, consumedSec }> }`）
  - 有効設定スナップショット（`effectiveSettings` / `effectiveSettingsLogicalDate`）
  - 残り時間通知履歴（`usageNotificationHistory`）
  - 対象ページ通知履歴（`pageOpenNotificationHistory`）
  - redirect ブロック通知履歴（`blockNotificationHistory`）
- background は起動時にカウンタを読み込み、現在の論理日と異なるカウンタは `consumedSec` を 0 に正規化する。
- 削除済みグループのカウンタは background のフラッシュ時に破棄してよい。
- background はメモリ上にバッファし、約7秒間隔／heartbeat アラーム（1分間隔）／`runtime.onSuspend` でフラッシュ
- カウンタを storage.local から再読み込みする際は、同じ論理日でより大きい `consumedSec` を優先してメモリ状態と統合する。
- 設定エクスポートファイルは `version: 2` と `settings` を持つ JSON。未対応バージョン、不正 JSON、不正な設定値はインポート拒否する。

## 必要 Permissions

`tabs`、`webNavigation`、`storage`、`alarms`、`idle`、`notifications`、`host_permissions: ["<all_urls>"]`

## 非要件（v1 では実装しない）

- グループごとのリダイレクト先 URL（グローバル1つで固定）
- 履歴・統計ダッシュボード（過去日の振り返り）
- popup からの一時無効化・現在ページのグループ追加
