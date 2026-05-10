# 仕様

正規表現で指定した URL に対して **1日あたりの閲覧時間** と **時間帯** を制限する Chrome 拡張機能。制限を超過すると別途設定したリダイレクト URL（デフォルト `https://example.com`）へ遷移するか、拡張機能が用意するブロックページを表示する。

## 用語

- **グループ** — 制限を共有する正規表現パターンの集合。第一級のエンティティ。
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
  - `patterns`: 正規表現文字列の配列
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

### グローバル設定

- `blockAction`: ブロック時の動作。`redirect`（既定）または `blockedPage`
- `redirectUrl`: 制限超過時のリダイレクト先 URL。デフォルト `https://example.com`
- `dailyResetHour`: 論理日の境界となる時刻（`HH:MM`）。デフォルト `00:00`

### 閲覧時間の計測

- 1秒ごとに加算する。
- 加算条件は **すべて** 満たすこと：
  - ブラウザウィンドウがフォーカスされている
  - アクティブタブが対象グループの正規表現にマッチする
  - `chrome.idle` の状態が `active`（5分無操作で停止）
- 同じ URL を複数タブで同時に開いていても、**1秒あたり1回** の加算（アクティブタブのみが意味を持つ）。
- 1つの URL が複数グループの正規表現にマッチした場合、**マッチしたすべてのグループ** に並列で1秒加算する。
- `whitelist` グループでは、正規表現にマッチしない URL が「対象グループに該当」とみなされるため、その URL を閲覧している間は同様に1秒加算する。

### ブロック判定

- グループ単位の判定式（時刻 T、曜日 D）：
  - まず URL が対象グループに該当するかを `mode` と `patterns` で判定する。該当しないグループは許可状態
  - D に該当する `dailyRules[]` を1件取得する
  - `blockedTimeRanges` が空で `dailyLimitMinutes` も未定義なら、そのグループは常に許可状態
  - `blockedTimeRanges` のうち T が `[startMinute, endMinute)` に含まれるものが1つでも存在 → ブロック状態
  - `dailyLimitMinutes` が定義されており、`consumedSec >= dailyLimitMinutes * 60` ならブロック状態
- URL 単位の判定：
  - URL がマッチするグループのうち **いずれか1つでもブロック状態** なら、その URL はブロックされる
- ブロックされた URL は `blockAction` に従って、`redirectUrl` へリダイレクトされるか拡張機能のブロックページへ遷移する。

### 正規表現の評価対象

- `tab.url` 全体（scheme・パス・クエリ・フラグメントを含む）に対して部分一致。
- `patterns` 配列内のいずれかの正規表現に部分一致すれば「マッチ」とする。
- 正規表現は Options 保存時に `new RegExp()` で検証する。background は壊れた保存データに含まれる無効な正規表現を無視し、Service Worker 全体を停止させない。
- 以下の URL は判定スキップ（=絶対にリダイレクトしない）：
  - `chrome://`、`chrome-extension://`、`about:`、`file://` で始まる URL
  - 現在の `redirectUrl` と完全一致する URL（無限ループ防止）

### リセット仕様

- 1日のリセット時刻はグローバルに1つ。
- 論理日が切り替わったタイミングで `consumedSec` を 0 に上書き。
- 過去日の履歴は保持しない（今日分のみ）。
- 日跨ぎのブロック時間帯は `end < start` で表現する（例 `22:00–06:00`）。`end === start` は 24 時間ブロックとして扱う。

### ブロック時の遷移動作

- 新規ナビゲーション：`chrome.webNavigation.onBeforeNavigate`（および SPA 用 `onHistoryStateUpdated`）で先回り判定し、`chrome.tabs.update` でブロック先 URL へ書き換える。
- `webNavigation` はトップレベルフレームのみを対象とし、`frameId !== 0` のイベントは無視する。
- 既存タブの状態変化：`chrome.alarms`（1分間隔）と毎秒ティックで再評価し、ブロック状態に切り替わったタブを `tabs.update` で書き換える。
- `tabs.update` の直前にも判定スキップ URL と `redirectUrl` 完全一致を確認し、リダイレクトループを防止する。
- `blockAction === "redirect"` の場合は `redirectUrl` へ遷移する。
- `blockAction === "blockedPage"` の場合は `blocked.html` を表示し、ブロックされた URL とブロック状態だったグループ名を表示する。

## 画面要件

### Options 画面（編集）

- グループの追加・編集・削除
- 各グループ：`name`、`mode`、`patterns[]`、`dailyRules[]`
- `mode` は `blacklist` / `whitelist` を選択できる。
- ブロック時間帯は曜日ごとに `HH:MM-HH:MM` のカンマ区切りテキスト、または30分グリッドで編集する
- 上限は曜日ごとに上限分数を入力する。空欄なら上限なし
- グローバル設定（`blockAction`、`redirectUrl`、`dailyResetHour`）の編集
- 保存時に正規表現の構文を `new RegExp()` で検証し、無効なら保存拒否＋インラインエラー
- 保存はキー入力のたびではなく debounce（300ms）で `chrome.storage.sync` のレート制限に配慮

### Popup 画面（状況表示・読み取り専用）

- グループごとに：`name`、`消費 / 上限`（`M:SS / 30:00` 形式）、ブロック時間帯内/外バッジ、ブロック発動中バッジ
- 全体のリセットまでのカウントダウン
- 「設定を開く」リンク
- 1秒間隔で再描画（`onUnmounted` でタイマー解除）

## ストレージ

- `chrome.storage.sync`：グループ定義、グローバル設定（ブロック時動作、リセット時刻、リダイレクト先）
- `chrome.storage.local`：グループごとの累積カウンタ（`{ counters: Record<groupId, { logicalDate, consumedSec }> }`）
- background は起動時にカウンタを読み込み、現在の論理日と異なるカウンタは `consumedSec` を 0 に正規化する。
- 削除済みグループのカウンタは background のフラッシュ時に破棄してよい。
- background はメモリ上にバッファし、約7秒間隔／heartbeat アラーム（1分間隔）／`runtime.onSuspend` でフラッシュ

## 必要 Permissions

`tabs`、`webNavigation`、`storage`、`alarms`、`idle`、`host_permissions: ["<all_urls>"]`

## 非要件（v1 では実装しない）

- グループごとのリダイレクト先 URL（グローバル1つで固定）
- 履歴・統計ダッシュボード（過去日の振り返り）
- popup からの一時無効化・現在ページのグループ追加
