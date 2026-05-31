# UI 仕様

## Options 画面（編集）

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
- シークレットモードでの拡張機能許可状態（Enabled / Disabled / Unable to check）を表示し、Chrome 拡張機能設定ページを開くボタンを提供する

## Popup 画面（状況表示・読み取り専用）

- 現在のタブ URL を有効設定で評価し、対象グループのうち当日上限があるグループを表示する
- 拡張機能ページ上で popup を開いた場合は、同一ウィンドウ内の判定対象タブを代替表示対象として探す
- 表示対象ごとに：`name`、残り時間、`消費 / 上限`（`M:SS / 30:00` 形式）、進捗メーター
- 判定スキップ URL の場合は「This page is excluded from blocking.」を表示する
- 対象グループがない場合は「No matching groups for this page.」を表示する
- 対象グループはあるが当日上限がない場合は「No daily limits apply to this page.」を表示する
- 「Options」ボタンから設定画面を開ける
- 1秒間隔で再描画（`onUnmounted` でタイマー解除）

## Blocked 画面

- 採用グループの `blockAction === "blockedPage"` の場合、`blocked.html` を表示する。
- query string の `url` にブロックされた URL、`group` にブロック状態だった group id を複数指定する。
- 画面にはブロックされた URL と、現在の有効設定から解決したブロックグループ名を表示する。
- 該当グループが有効設定に存在しない場合は `Unknown setting` と表示する。
- `Back` ボタンはブラウザ履歴の直前ページへ戻る。
