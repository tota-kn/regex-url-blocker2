# アイコンバッジ残り時間表示バグ — 調査中断メモ

## 現状

バッジが全く表示されない。E2Eテストを追加して失敗を確認済み。

## 変更済みファイル

### `e2e/background.spec.ts`

`Badge display` describe ブロックを末尾に追加（3テストケース）:

1. **時間制限のある URL にアクセスするとバッジに残り時間を表示する** → `"60m"` 期待 → **失敗（空文字）**
2. **対象外の URL ではバッジが空になる** → `""` 期待 → **成功**
3. **消費時間がある場合にバッジが残り時間を正しく反映する** → `"50m"` 期待 → **失敗（空文字）**

ヘルパー関数 `getBadgeText` / `getTabIdByUrl` も追加済み。

## デバッグで判明したこと

### 確認できた事実

| 確認内容 | 結果 |
|---|---|
| `chrome.action.getBadgeText` / `setBadgeText` は動くか | **YES** — SW evaluate から直接呼ぶと動作する |
| ストレージに正しい settings が書き込まれているか | **YES** — `groups[0].timeLimits = [{daysOfWeek:[], dailyMinutes:60}]` |
| counters が正規化されてストレージに保存されているか | **YES** — `counters['timed-group'] = {consumedSec:0, logicalDate:'2026-05-06'}` |
| ナビゲーション後、対象タブの badge は何か | **`""` (空文字)** — background スクリプトが setBadgeText を呼んでいない |

### わかっていないこと

- `handleNavigation` / `updateActionForTab` が呼ばれているかどうか（WXT の `runAsync` が使われており、console.error があっても捕捉できていない）
- 以下のどれが原因か:
  - **A. `updateActionForTab` 自体が呼ばれていない** — `storage.onChanged` の reload タイミングと navigation のタイミングが競合し、`settings.groups = []` の状態で `getMinimumRemainingTimeLimit` が `undefined` を返している
  - **B. `chrome.action.setBadgeText` のコールバック形式が失敗している** — WXT ビルド後の `actionCallbackPromise` が正常に動かない
  - **C. 何か別の呼び出しがバッジを空に上書きしている** — `tabs.onUpdated` 等で別の URL を受け取りバッジをリセット

## 既存ブロックテストとの違い

blocking テスト（pass）はすべて `dailyMinutes: 0`（即ブロック・リダイレクト）を使用。  
badge テスト（fail）は `dailyMinutes: 60`（リダイレクトなし）を使用。  
→ navigation イベント自体は両方で発火しているはず（ブロックが動いているため）。

## 次の調査候補

### 案 A: `buildActionState` の返り値を直接確認

SW evaluate で `loadSettings` 相当の処理 + `getMinimumRemainingTimeLimit` 相当ロジックを再現して、`undefined` を返すかを直接確認する。

### 案 B: `updateActionForTab` を `browser.action`（WXT Promise API）に書き換える

`chrome.action` のコールバック形式をやめ、`browser.action.setBadgeText` 等の Promise 形式に統一する。
コード量が減り、デバッグしやすくなる。

```diff
// entrypoints/background.ts
- const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome
- await Promise.all([
-   setActionBadgeText(chromeApi, tab.id, next.text),
-   setActionTitle(chromeApi, tab.id, next.title),
-   setActionBadgeBackgroundColor(chromeApi, tab.id, next.color),
- ])
+ await Promise.all([
+   browser.action.setBadgeText({ tabId: tab.id, text: next.text }),
+   browser.action.setTitle({ tabId: tab.id, title: next.title }),
+   browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: next.color }),
+ ])
```

ヘルパー関数 `setActionBadgeText` / `setActionTitle` / `setActionBadgeBackgroundColor` / `actionCallbackPromise` / `ChromeActionApi` / `ChromeRuntimeApi` / `ChromeApi` インターフェースも不要になる。

### 案 C: `tick()` による更新に頼る

`handleNavigation` に頼らず、1秒ごとの `tick()` でバッジが更新されるかを確認。  
→ tick は focused window の active tab のみ対象なので、テスト環境では動かない可能性がある。

## 推奨: 案 B から試す

`browser.action` は WXT が推奨する標準 API。`chrome.action` のコールバック形式は WXT の Promise polyfill と干渉する可能性がある。
