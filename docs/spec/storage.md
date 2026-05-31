# ストレージ仕様

- `chrome.storage.sync`：グループ定義（ブロック時動作、リダイレクト先を含む）、グローバル設定（互換用のブロック時動作・リダイレクト先、リセット時刻、残り時間通知閾値、対象ページ通知設定、redirect ブロック通知設定）
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
- 設定エクスポートファイルは `version: 3` と `settings` を持つ JSON。インポートは互換のため `version: 2` と `version: 3` を受け付ける。未対応バージョン、不正 JSON、不正な設定値はインポート拒否する。
