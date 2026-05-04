# 仕様

正規表現で指定した URL に対して **1日あたりの閲覧時間** と **時間帯** を制限する Chrome 拡張機能。制限を超過すると別途設定したリダイレクト URL（デフォルト `https://example.com`）へ遷移させる。

## 用語

- **グループ** — 制限を共有する正規表現パターンの集合。第一級のエンティティ。
- **正規表現** — URL 文字列全体に対して部分一致を行うパターン。JS の `RegExp` 構文。
- **論理日** — グローバル設定の「リセット時刻」を起点とする1日。`floor((now - resetHour) / 24h)` で算出。
- **消費秒数** — グループ単位で計測される、1日に該当グループの URL を閲覧した累積秒数。
- **許可時間帯** — そのグループの閲覧が許可される時間帯。空配列なら24時間 OK。

## 機能要件

### グループ

- 各グループは以下の属性を持つ：
  - `id`: UUID（自動採番）
  - `name`: ユーザー入力の表示名（必須）
  - `patterns`: 正規表現文字列の配列
  - `dailyTimeLimitMinutes`: 1日あたり閲覧上限（分）。`null` で「上限なし」、`0` で「即ブロック」を表現
  - `allowedHours`: 許可時間帯の配列。各要素は `{ start: "HH:MM", end: "HH:MM" }`
- グループの並び順はユーザーがドラッグ&ドロップで変更可能（**表示用途のみ**、判定ロジックには影響しない）。

### グローバル設定

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

### ブロック判定

- グループ単位の判定式：
  - `outsideAllowedHours OR consumedSec >= dailyTimeLimitMinutes * 60` のとき、そのグループはブロック状態
  - `allowedHours` が空配列なら時間帯判定は常に通過（24時間 OK）
  - `dailyTimeLimitMinutes` が `null` なら上限判定は常に通過
- URL 単位の判定：
  - URL がマッチするグループのうち **いずれか1つでもブロック状態** なら、その URL はブロックされる
- ブロックされた URL は `redirectUrl` へリダイレクトされる。

### 正規表現の評価対象

- `tab.url` 全体（scheme・パス・クエリ・フラグメントを含む）に対して部分一致。
- 以下の URL は判定スキップ（=絶対にリダイレクトしない）：
  - `chrome://`、`chrome-extension://`、`about:`、`file://` で始まる URL
  - 現在の `redirectUrl` と完全一致する URL（無限ループ防止）

### リセット仕様

- 1日のリセット時刻はグローバルに1つ。
- 論理日が切り替わったタイミングで `consumedSec` を 0 に上書き。
- 過去日の履歴は保持しない（今日分のみ）。
- 日跨ぎの許可時間帯は `end <= start` で表現する（例 `22:00–06:00`）。

### リダイレクト動作

- 新規ナビゲーション：`chrome.webNavigation.onBeforeNavigate`（および SPA 用 `onHistoryStateUpdated`）で先回り判定し、`chrome.tabs.update` で `redirectUrl` へ書き換える。
- 既存タブの状態変化：`chrome.alarms`（1分間隔）と毎秒ティックで再評価し、ブロック状態に切り替わったタブを `tabs.update` で書き換える。

## 画面要件

### Options 画面（編集）

- グループの追加・編集・削除・並び替え
- 各グループ：`name`、`patterns[]`、`dailyTimeLimitMinutes`、`allowedHours[]`
- 許可時間帯は `<input type="time">` を1組とし、複数組を `+追加` で増やす
- グローバル設定（`redirectUrl`、`dailyResetHour`）の編集
- 保存時に正規表現の構文を `new RegExp()` で検証し、無効なら保存拒否＋インラインエラー
- 保存はキー入力のたびではなく debounce（300ms）で `chrome.storage.sync` のレート制限に配慮

### Popup 画面（状況表示・読み取り専用）

- グループごとに：`name`、`消費 / 上限`（`M:SS / 30:00` 形式）、許可時間帯内/外バッジ、ブロック発動中バッジ
- 全体のリセットまでのカウントダウン
- 「設定を開く」リンク
- 1秒間隔で再描画（`onUnmounted` でタイマー解除）

## ストレージ

- `chrome.storage.sync`：グループ定義、グローバル設定（リセット時刻、リダイレクト先）
- `chrome.storage.local`：グループごとの累積カウンタ（`{ logicalDate, consumedSec }`）
- background はメモリ上にバッファし、約7秒間隔／heartbeat アラーム／`runtime.onSuspend` でフラッシュ

## 必要 Permissions

`tabs`、`webNavigation`、`storage`、`alarms`、`idle`、`host_permissions: ["<all_urls>"]`

## 非要件（v1 では実装しない）

- 曜日別の許可時間帯（平日/週末で異なる設定）
- グループごとのリダイレクト先 URL（グローバル1つで固定）
- 履歴・統計ダッシュボード（過去日の振り返り）
- popup からの一時無効化・現在ページのグループ追加
