# Regex URL Blocker — 時間制限・時間帯制限・グループ機能 実装プラン

## Context

現状の `regex-url-blocker2` は WXT + Vue 3 のスケルトンと、未配線の `BlockRuleForm/Item/List` コンポーネントが残っているのみで、ブロック・計測・リダイレクトのロジックは何も実装されていない。

ユーザーが提示した新要件は次の通り：

- 指定 URL について **1日あたりの閲覧時間** と **時間帯** を制限する
- 制限超過時は別途設定した URL（デフォルト `https://example.com`）にリダイレクト
- URL は正規表現で指定する
- 複数の URL を **グループ** にまとめ、グループ単位で制限を設定する

既存コード・既存設計には後方互換を要求しない（ユーザー指示）。本プランは丸ごと再設計し、テストファースト（CLAUDE.md ワークフロー準拠）で実装する。最終的に Vitest と Playwright の両方で要件を検証できる状態を目指す。

## 設計決定事項（ユーザーとの確認済み）

| # | 項目 | 決定 |
|---|---|---|
| 1 | データモデル | グループが第一級。グループ内の複数正規表現は同じ制限枠を共有 |
| 2 | 閲覧時間の計測 | アクティブタブ ∧ ウィンドウフォーカス中 のみ加算。同グループ内の複数タブ同時表示でも 1秒/秒。`chrome.idle` で 5分無操作なら停止 |
| 3 | 時間帯制限 | 許可時間帯（whitelist）方式。日跨ぎ表記対応。曜日別なし。空配列は 24時間 OK |
| 4 | 2軸の組み合わせ | 両方任意。判定は OR（時間帯外 または 上限超過）。両方未設定も許容（UI で警告） |
| 5 | 1日のリセット | カスタム時刻。スコープはグローバル。デフォルト `00:00` |
| 6 | リダイレクト先 URL | グローバル1つ。デフォルト `https://example.com` |
| 7 | リダイレクト実装 | `webNavigation.onBeforeNavigate` + `tabs.onUpdated` + `alarms` 定期チェックで `tabs.update`。正規表現は JS `RegExp` 直接 |
| 8 | 複数グループにマッチ | 全マッチグループに加算。いずれかブロック条件で全体ブロック |
| 9 | ストレージ | グループ・設定は `chrome.storage.sync`、累積カウンタは `chrome.storage.local`。background はメモリ保持＋間欠 flush |
| 10 | UI 構成 | options=編集、popup=状況表示（読み取り専用）。一時無効化なし |
| 11 | 時間帯入力 UI | `<input type="time">` × 複数組。保存形式 `[{ start: "HH:MM", end: "HH:MM" }, ...]` |
| 12 | 履歴保持 | 今日分のみ |
| 13 | 正規表現の評価対象 | URL 文字列全体に部分一致。`chrome://`/`chrome-extension://`/`about:`/`file://` とリダイレクト先 URL は判定スキップ |
| 14 | 時間上限の入力単位 | 分単位入力、内部秒。`null`=上限なし、`0`=即ブロック |
| 15 | グループの識別と並び | `id`（UUID）+ `name`（必須）。ドラッグ&ドロップで並び替え可。保存時に正規表現の構文検証 |
| 16 | popup 更新 | `setInterval(1s)` で再描画。`onUnmounted` でタイマー解除 |

## 実装アプローチ

### データ型（`utils/types.ts`）

```ts
export interface AllowedHourRange { start: string; end: string }  // "HH:MM"
export interface Group {
  id: string
  name: string
  patterns: string[]
  dailyTimeLimitMinutes: number | null
  allowedHours: AllowedHourRange[]
}
export interface GlobalSettings {
  redirectUrl: string
  dailyResetHour: string  // "HH:MM"
}
export interface Accumulator { logicalDate: string; consumedSec: number }
export type AccumulatorMap = Record<string, Accumulator>
export type BlockReason = 'time-of-day' | 'daily-limit'
```

### 純粋ユーティリティ（Vitest 対象）

`utils/` 配下、`chrome.*` を import しない。`now: Date` を引数で受け取り、テスト時に固定可能にする。

- [utils/logical-day.ts](utils/logical-day.ts) — `getLogicalDate(now, resetHHMM)`、`msUntilNextLogicalDay(now, resetHHMM)`、`hhmmToMinutes(str)`
- [utils/time-of-day.ts](utils/time-of-day.ts) — `isWithinAllowedHours(now, ranges)`。`end <= start` を `[start, 24:00) ∪ [00:00, end)` として扱う。空配列 `true`
- [utils/regex-match.ts](utils/regex-match.ts) — `SKIP_URL_PREFIXES`、`shouldSkipUrl(url, redirectUrl)`、`validatePattern(pattern)`、`compilePatterns(patterns)`、`matchesAny(url, compiled)`
- [utils/block-decision.ts](utils/block-decision.ts) — `decideGroupBlock(group, accumulator, now)` と `decideUrlBlock(url, groups, accumulators, now, redirectUrl)`
- [utils/accumulator.ts](utils/accumulator.ts) — `tickAccumulator(prev, now, resetHHMM)`、`ensureToday(prev, now, resetHHMM)`
- [utils/uuid.ts](utils/uuid.ts) — `crypto.randomUUID()` ラッパー

### ストレージ層（`utils/storage.ts`）

- `getSettings()/setSettings()` → `chrome.storage.sync`
- `getGroups()/setGroups()` → `chrome.storage.sync`
- `getAccumulators()/setAccumulators()` → `chrome.storage.local`
- `onSyncChange(cb)` → `chrome.storage.onChanged`（`area === 'sync'` のみ）
- デフォルト値：`redirectUrl="https://example.com"`、`dailyResetHour="00:00"`、`groups=[]`、`accumulators={}`

### Background 構成（[entrypoints/background.ts](entrypoints/background.ts) 全面書き換え）

**起動時（毎回コールドスタート対応）：**
1. `bgState.hydrate()` で settings/groups/accumulators をロード、正規表現コンパイル
2. リスナーをトップレベル登録（SW 再起動時に再 attach されることを保証）
   - `windows.onFocusChanged` → `bgTick.setFocused`
   - `tabs.onActivated` / `tabs.onUpdated`（`changeInfo.url` あり）→ `bgTick.setActiveTabUrl` + `bgRedirect.evaluateAndRedirectTab`
   - `idle.onStateChanged` → `bgTick.setIdle`
   - `idle.setDetectionInterval(300)`
   - `webNavigation.onBeforeNavigate`（`frameId === 0`）→ ブロック判定 → リダイレクト
   - `webNavigation.onHistoryStateUpdated`（SPA 対応）
   - `storage.onChanged`（`area === 'sync'`）→ 再ハイドレート＋全タブ再評価
3. `tabs.query({ active: true, lastFocusedWindow: true })` と `windows.getLastFocused()` で初期状態取得
4. `alarms.create('heartbeat', { periodInMinutes: 1 })` → 全タブ再評価＋flush。`alarms.create('tick', { periodInMinutes: 1 })` で SW を起こし続ける
5. `setInterval(() => onSecondTick(new Date()), 1000)` で毎秒ティック
6. `runtime.onSuspend` で `bgState.flushIfDirty()` を同期実行

**毎秒ティック処理（`utils/bg-tick.ts`）:**
```
if (!isFocused || idleState !== 'active' || !activeTabUrl) return
if (shouldSkipUrl(activeTabUrl, redirectUrl)) return
const matchingGroupIds = groups.filter(g => matchesAny(url, compiled[g.id])).map(g => g.id)
for (const gid of matchingGroupIds) {
  accumulators[gid] = tickAccumulator(accumulators[gid], now, resetHHMM)
  dirty.add(gid)
}
// 直後にブロック判定して、超過した瞬間にリダイレクト
```

**Flush 戦略（`utils/bg-state.ts`）:**
- 7秒 `setInterval` で `flushIfDirty()`
- `'heartbeat'` アラーム
- `runtime.onSuspend`

**リダイレクト（`utils/bg-redirect.ts`）:**
- `evaluateAndRedirectTab(tabId, url)` — `decideUrlBlock` でブロック判定 → `tabs.update({ url: redirectUrl })`
- `evaluateAllOpenTabs()` — `tabs.query({})` で全タブ反復

### Vue コンポーネント

**Options（編集）:**
- [entrypoints/options/OptionsPage.vue](entrypoints/options/OptionsPage.vue) — 全体レイアウト + `useGroups()` / `useSettings()`
- `components/options/GlobalSettingsEditor.vue` — `redirectUrl`、`dailyResetHour`
- `components/options/GroupList.vue` — HTML5 `draggable` でグループ並び替え（外部依存なし）
- `components/options/GroupEditor.vue` — name + 子コンポーネント
- `components/options/PatternListEditor.vue` — 正規表現リスト。`validatePattern` で行ごと検証
- `components/options/AllowedHoursEditor.vue` — `<input type="time">` × 複数行＋[+追加]
- 保存は debounce 300ms + `setGroups` / `setSettings`（`storage.sync` レート制限対策）

**Popup（状況表示）:**
- [entrypoints/popup/PopupPage.vue](entrypoints/popup/PopupPage.vue) — `useNow(1000)` + `useGroups()` + `useAccumulators()`
- `components/popup/GroupStatusRow.vue` — `${formatMSS(consumedSec)} / ${limit}`、時間帯内/外バッジ、ブロック中バッジ
- `components/popup/ResetCountdown.vue` — 次のリセットまで `H:MM:SS`
- 「設定を開く」リンク：`chrome.runtime.getURL('options.html')`

**Composable:**
- `utils/use-storage.ts` — `useGroups()`、`useSettings()`、`useAccumulators()`。`storage.onChanged` でリアクティブ更新
- `utils/use-now.ts` — `Ref<Date>` を `setInterval` で更新、`onUnmounted` で解除

### Manifest 変更（[wxt.config.ts](wxt.config.ts)）

```ts
manifest: {
  permissions: ['tabs', 'webNavigation', 'storage', 'alarms', 'idle'],
  host_permissions: ['<all_urls>'],
  options_ui: { page: 'options/index.html' },
  // popup は WXT 規約で自動生成
}
```

## Critical Files for Implementation

### ドキュメント
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/SPEC.md — 全面書き換え（要件定義を上記決定事項ベースで記載）
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/PLAN.md — 新規作成（本プランをコピー）

### 修正
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/wxt.config.ts — manifest permissions 追加
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/entrypoints/background.ts — 全面書き換え
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/entrypoints/options/OptionsPage.vue — 全面書き換え
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/entrypoints/popup/PopupPage.vue — 全面書き換え
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/e2e/smoke.spec.ts — 既存の `aaaHello World` テスト削除、新仕様に合わせ更新

### 削除
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/components/BlockRuleForm.vue
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/components/BlockRuleItem.vue
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/components/BlockRuleList.vue
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/components/HelloWorld.vue
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/entrypoints/content.ts — webNavigation/tabs で代替するため不要
- /home/yt/repos/github.com/tota-kn/regex-url-blocker2/test/sum.test.ts — プレースホルダ

### 新規（純粋ロジック）
- utils/types.ts
- utils/logical-day.ts
- utils/time-of-day.ts
- utils/regex-match.ts
- utils/block-decision.ts
- utils/accumulator.ts
- utils/uuid.ts

### 新規（副作用層）
- utils/storage.ts
- utils/bg-state.ts
- utils/bg-tick.ts
- utils/bg-redirect.ts
- utils/use-storage.ts
- utils/use-now.ts

### 新規（Vue コンポーネント）
- components/options/GlobalSettingsEditor.vue
- components/options/GroupList.vue
- components/options/GroupEditor.vue
- components/options/PatternListEditor.vue
- components/options/AllowedHoursEditor.vue
- components/popup/GroupStatusRow.vue
- components/popup/ResetCountdown.vue

### 新規（テスト）
- test/logical-day.test.ts
- test/time-of-day.test.ts
- test/regex-match.test.ts
- test/block-decision.test.ts
- test/accumulator.test.ts
- e2e/options.spec.ts
- e2e/popup.spec.ts
- e2e/blocking.spec.ts

## 実装順序（テストファースト）

0. **ドキュメント整備** —
   - [SPEC.md](SPEC.md) を全面書き換えし、上記「設計決定事項」表をベースとした要件定義を記載する
   - リポジトリルートに `PLAN.md` を新規作成し、本プラン（`a-golden-parrot.md`）の内容を保存する
1. **Vitest テスト → 純粋ユーティリティ実装** — `types.ts`、`logical-day`、`time-of-day`、`regex-match`、`block-decision`、`accumulator`、`uuid`
2. **storage 層** — `utils/storage.ts`、`utils/use-storage.ts`、`utils/use-now.ts`
3. **Vue コンポーネント＋ Options/Popup ページ** — UI を先に組み、storage 経由で設定 CRUD ができる状態へ
4. **Background 実装** — `wxt.config.ts` の permissions も同時更新
5. **不要ファイル削除** — `components/*` の旧4ファイル、`entrypoints/content.ts`、`test/sum.test.ts`
6. **E2E テスト** — `e2e/options.spec.ts`、`e2e/popup.spec.ts`、`e2e/blocking.spec.ts`

## 検証

各ステップ完了時、および最終時に：

```sh
pnpm test:unit     # Vitest 全グリーン
pnpm typecheck     # vue-tsc --noEmit エラーなし
pnpm lint          # ESLint --max-warnings 0
pnpm test:e2e      # wxt build → playwright 全グリーン
```

E2E は [e2e/fixtures.ts](e2e/fixtures.ts) の `context` / `extensionId` を再利用し、`context.serviceWorkers()[0].evaluate(...)` 経由で background から `chrome.storage.sync.set` / `chrome.storage.local.get` を直接操作してシード／検証する。

具体的に E2E で検証する要件：
- グループ CRUD（追加・編集・削除・並び替え）が options で完結する
- 無効な正規表現は保存できずインラインエラーが出る
- popup に各グループの消費／上限／時間帯／リダイレクト発動状態が表示される
- `dailyTimeLimitMinutes: 0` のグループにマッチする URL が `redirectUrl` へ即リダイレクト
- 「現在時刻を含まない」許可時間帯のグループにマッチする URL がリダイレクト
- カスタム `redirectUrl` がそのまま遷移先になる
- 日跨ぎレンジ（`22:00–06:00`）が正しく判定される（popup の in/out バッジで確認）
- 同一 URL が2グループにマッチしたとき、両方のカウンタが進行する（local storage を直接読み出して確認）

## リスクと注意点

- **MV3 Service Worker 終了** — `setInterval` は SW 死亡で消える。`'tick'` アラームで毎分起こすことで、最悪 ~60秒ぶんの計測欠落に抑える。実装時は bootstrap が必ず再 attach されるよう、リスナーを `defineBackground` のトップレベルに配置する
- **idle 検出のラグ** — `setDetectionInterval(300)` で5分粒度。ただし `windows.onFocusChanged → WINDOW_ID_NONE` で即時に「非対象」へ落とせるので体感的には十分
- **storage.sync レート制限** — `MAX_WRITE_OPERATIONS_PER_MINUTE = 120`。options での編集は debounce、グループ全体を1キー（`groups`）にバッチ書き込み
- **コールドスタート競合** — `webNavigation.onBeforeNavigate` がハイドレート完了前に発火する可能性。`bgState.ready: Promise<void>` を export し、ハンドラ冒頭で `await ready`。最悪ケースでも次回の heartbeat（≤1分）で巻き戻し
- **SPA pushState** — `webNavigation.onHistoryStateUpdated`（`frameId === 0`）も登録（YouTube/Twitter 等）
- **無限リダイレクトループ** — `shouldSkipUrl` が `redirectUrl` 完全一致を弾く。ユーザーが redirectUrl にもマッチする正規表現を書いた場合の保険
- **DST** — `getLogicalDate` はローカル時刻ベース。DST 移行日は論理日が23/25時間になるが、消費秒数は壁時計秒で意味的に問題なし
- **`entrypoints/content.ts` 削除確認** — WXT はファイル名でエントリ種別を決めるため、削除すれば manifest からも消える。最初のビルド後に `.output/chrome-mv3/manifest.json` で `content_scripts` が消えていることを確認
