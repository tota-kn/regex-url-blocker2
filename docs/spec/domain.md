# ドメイン仕様

## 用語

- **グループ** — 制限を共有する URL pattern の集合。第一級のエンティティ。
- **URL pattern** — 裸ドメインまたは正規表現。裸ドメインは対象ドメイン本体とサブドメインの全ページに一致する。
- **正規表現** — URL 文字列全体に対して部分一致を行うパターン。JS の `RegExp` 構文。
- **論理日** — グローバル設定の「リセット時刻」を起点とする1日。`floor((now - resetHour) / 24h)` で算出。
- **消費秒数** — グループ単位で計測される、1日に該当グループの URL を閲覧した累積秒数。
- **Time window** — 制限を有効にする日付条件と時間帯。`always` は常時有効、時間帯が空なら終日有効。
- **Restriction** — `block` / `redirect` / `grace` / `wait` の制限内容。Time window とは独立して複数登録できる。

## グループ

- 各グループは以下の属性を持つ：
  - `id`: UUID（自動採番）
  - `name`: ユーザー入力の表示名（必須）
  - `mode`: 対象 URL の判定モード。`blacklist`（既定）または `whitelist`
  - `lockMode`: `true` の場合、このグループの変更は次回 daily reset まで有効設定へ反映しない。既定 `false`
  - `patterns`: URL pattern 文字列の配列
  - `timeWindows`: Time window の配列
  - `restrictions`: Restriction の配列
  - 保存可能なグループでは `patterns`、`timeWindows`、`restrictions` はそれぞれ最低1件必要。いずれかが空の未完成なグループは Options 上で保存できない
- `mode` の意味：
  - `blacklist`: `patterns` のいずれかにマッチした URL を制限対象とする
  - `whitelist`: `patterns` のいずれにもマッチしない URL を制限対象とする
  - 旧データなどで `mode` が欠損している場合は `blacklist` として扱う
- 各 `timeWindows[]` は `always`、または `condition` と `timeRanges` を持つ `scheduled`。`timeRanges` の各要素は `startMinute` / `endMinute`（0..1440）で、`endMinute < startMinute` なら日跨ぎ、`endMinute === startMinute` なら 24 時間、空配列なら終日有効
- 各 `restrictions[]` は以下の属性を持つ：
  - `type`: `block`（禁止） / `redirect`（指定 URL へ遷移） / `grace`（1日の閲覧上限） / `wait`（アクセス前待機）
  - `redirectUrl`: `type === 'redirect'` の遷移先 URL
  - `graceMinutes`: `type === 'grace'` の1日あたり閲覧上限（分）。`0` で「即ブロック」
  - `waitSeconds`: `type === 'wait'` のアクセス前待機秒数。`0` は待機なし扱い
  - `waitGrantMinutes`: `type === 'wait'` の通過後アクセス許可期間（分）。`1` 以上の整数を指定する。未設定または旧データの `0` は `10` として扱う
- `condition` の種類（`type` で判別）：
  - `daily`: 毎日一致する
  - `weekly`: `daysOfWeek`（0=日〜6=土）に含まれる曜日に一致する
  - `monthly`: `daysOfMonth`（1〜31）に含まれる日に一致する。31 は日数の少ない月では一致しない（「月末」エイリアスは非対応）
  - `period`: 毎年繰り返す期間。`start` / `end`（`MonthDay = { month, day }`）で表し両端を含む。`start > end`（月日比較）なら年末年始のような年跨ぎ期間、`start === end` は単日。`2/29` は閏年のみ一致する
- 制限の合成（Time window が1件以上有効な場合）：
  - **一致した全ルールを適用する**。`block` / `redirect` は即時ハードブロック、`grace` は上限到達後にブロック、未ブロック時だけ `wait` を適用する
  - 保存可能な設定では `grace` と `wait` は各1件まで、`block` と `redirect` は合計1件までとする
  - 編集中は一時的な重複・併存を許可するが、解消するまで保存できない
  - 未正規化データで `block` と `redirect` が併存する場合は、安全側として `block` を優先する
  - リストの順序は結果に影響しない
- 条件マッチの判定は **論理日切り替え時点の暦（曜日・月・日）**（リセット時刻起点）で行う。例: リセット `03:00` のとき `1/2 02:00` は論理日 `1/1` 扱いで、曜日・月日も `1/1` として判定する。
- グループは追加順に表示する（v1 では並び替え非対応）。
- 各グループはブロック時の遷移先設定を持つ：
  - `blockAction`: `redirect` または `blockedPage`（既定）
  - `redirectUrl`: `blockAction === "redirect"` の場合のリダイレクト先 URL。デフォルト `https://example.com`

## グローバル設定

- `blockAction`: 旧データ互換のため保持するブロック時動作。新規グループ作成時の初期値として使い、Options UI ではグループ単位の `blockAction` を編集する。デフォルト `blockedPage`
- `redirectUrl`: 旧データ互換のため保持するリダイレクト先 URL。新規グループ作成時の初期値として使い、Options UI ではグループ単位の `redirectUrl` を編集する。デフォルト `https://example.com`
- `dailyResetHour`: 論理日の境界となる時刻（`HH:MM`）。デフォルト `03:00`
- `remainingTimeNotificationsEnabled`: 残り閲覧時間通知を有効にする。デフォルト `true`
- `notificationThresholdMinutes`: 残り閲覧時間通知を出す閾値（分）。デフォルト `5`。1以上の整数

## 閲覧時間の計測

- 1秒ごとに加算する。
- 加算条件は **すべて** 満たすこと：
  - ブラウザウィンドウがフォーカスされている
  - アクティブタブが対象グループの URL pattern にマッチする
  - `chrome.idle` の状態が `active`（5分無操作で停止）
- 同じ URL を複数タブで同時に開いていても、**1秒あたり1回** の加算（アクティブタブのみが意味を持つ）。
- 1つの URL が複数グループの URL pattern にマッチした場合、**マッチしたすべてのグループ** に並列で1秒加算する。
- `whitelist` グループでは、URL pattern にマッチしない URL が「対象グループに該当」とみなされるため、その URL を閲覧している間は同様に1秒加算する。

## ブロック判定

- グループ単位の判定式（時刻 T、論理日情報）：
  - まず URL が対象グループに該当するかを `mode` と `patterns` で判定する。該当しないグループは許可状態
  - 各 `timeWindows[]` の条件と時間帯を判定し、1件以上有効なら `restrictions[]` を適用する
  - 有効な `block` または `redirect` ルールが存在 → ブロック状態。`redirect` は自身の `redirectUrl` を遷移先にする
  - 有効な `grace` ルールがあり、`consumedSec >= graceMinutes * 60` ならブロック状態
  - 有効な `wait` ルールがあり、まだ待機ゲート通過済みでなければ待機ページへ遷移する
- URL 単位の判定：
  - URL がマッチするグループのうち **いずれか1つでもブロック状態** なら、その URL はブロックされる
- ブロックされた URL は、ブロック状態だったグループのうち Options 画面の表示順で最初のグループの `blockAction` に従って、当該グループの `redirectUrl` へリダイレクトされるか拡張機能のブロックページへ遷移する。

## URL pattern の評価対象

- 裸ドメイン（例: `example.com`）は、URL の hostname がそのドメイン本体またはサブドメインなら「マッチ」とする。
- 裸ドメイン以外は正規表現として扱い、`tab.url` 全体（scheme・パス・クエリ・フラグメントを含む）に対して部分一致すれば「マッチ」とする。
- URL pattern は Options 保存時に「裸ドメインとして妥当、または `new RegExp()` で構文解析可能」であることを検証する。background は壊れた保存データに含まれる無効な正規表現を無視し、Service Worker 全体を停止させない。
- 以下の URL は判定スキップ（=絶対にリダイレクトしない）：
  - `chrome://`、`chrome-extension://`、`about:`、`file://` で始まる URL
  - 全グループの `redirectUrl` と完全一致する URL（無限ループ防止）

## リセット仕様

- 1日のリセット時刻はグローバルに1つ。
- 論理日が切り替わったタイミングで `consumedSec` を 0 に上書き。
- 過去日の履歴は保持しない（今日分のみ）。
- 日跨ぎのブロック時間帯は `end < start` で表現する（例 `22:00–06:00`）。`end === start` は 24 時間ブロックとして扱う。

## ブロック時の遷移動作

- 新規ナビゲーション：`chrome.webNavigation.onBeforeNavigate`（および SPA 用 `onHistoryStateUpdated`）で先回り判定し、`chrome.tabs.update` でブロック先 URL へ書き換える。
- `webNavigation` はトップレベルフレームのみを対象とし、`frameId !== 0` のイベントは無視する。
- 既存タブの状態変化：`tabs.onUpdated`、`tabs.onActivated`、`windows.onFocusChanged`、`chrome.alarms`（1分間隔）と毎秒ティックで再評価し、ブロック状態に切り替わったタブを `tabs.update` で書き換える。
- `tabs.update` の直前にも判定スキップ URL と全グループの `redirectUrl` 完全一致を確認し、リダイレクトループを防止する。
- 採用グループの `blockAction === "redirect"` の場合は、そのグループの `redirectUrl` へ遷移する。
- 採用グループの `blockAction === "blockedPage"` の場合は `blocked.html` を表示し、ブロックされた URL とブロック状態だったグループ名・理由を表示する。
- 時間帯ブロックの解除時刻は、翌論理日が別のスケジュールルールになりうるため、論理日境界ごとに実効制限を再評価しながら次に非ブロックとなる時刻まで進めて算出する（最大 366 論理日分）。連日終日ブロックのように解除予定が存在しない場合は「Not scheduled」を表示する。

## 設定変更の反映タイミング

- ユーザーが保存した設定は `chrome.storage.sync` に「希望設定」として保存する。
- background は `chrome.storage.local` に「有効設定スナップショット」を保持し、URL 判定・badge・counter 加算にはこの有効設定を使う。
- `lockMode: false` のグループは、追加・編集・削除を同じ論理日中でも希望設定どおり即時反映する。
- `lockMode: true` のグループは、rule day 開始時（同日中に ON にした場合は ON 時点）の制限設定を基準として次回リセット時刻まで維持する。基準設定と最新の希望設定を独立に評価し、対象 URL は和集合、block は OR、grace は残り時間が短い方、wait は長い方を採用する。これにより厳格化は即時反映し、緩和だけを次回リセットまで保留する。
- 二重評価する制限設定は `patterns`、`mode`、`disabled`、`timeWindows`、`restrictions`、Lock Mode の OFF、グループ削除とする。`name`、`blockAction`、`redirectUrl` は希望設定を即時反映する。
- 有効設定に存在しない新規グループは即時反映する。新規グループを `lockMode: true` で保存した場合、初回保存は即時有効化され、その後の変更が次回リセットまで保留される。
- `remainingTimeNotificationsEnabled` と `notificationThresholdMinutes` は同じ論理日中でも希望設定を即時反映する。グループ別の `blockAction` と `redirectUrl` はグループ設定として反映タイミングに従う。
- 希望設定または有効設定のどちらかに `lockMode: true` のグループがある間、`dailyResetHour` は変更できず、現在有効なリセット時刻を維持する。
- 論理日が切り替わったタイミングで希望設定全体を新しい基準へ昇格する。Lock Mode が OFF または削除済みのグループの旧基準は破棄する。

## 残り時間通知・Action Badge

- `remainingTimeNotificationsEnabled` が `true` かつ現在の active tab が閲覧上限付きグループの対象 URL で、残り時間が `notificationThresholdMinutes` 分以下かつ 0 秒より大きい場合、Chrome notification を表示する。
- 残り時間通知はグループごと・論理日ごとに1回だけ表示する。
- 通知本文は対象グループ名と当日残り分数を表示する。
- `notificationThresholdMinutes` は残り時間通知だけに適用する。
- action badge は、現在タブの対象グループのうち当日残り時間が最も短い上限を分単位切り上げ（例 `5m`）で表示する。
- action badge の色は通常時が青、残り5分以下が警告色、残り0秒がブロック色。
- 対象 URL に当日上限がない場合、action badge は空にする。
