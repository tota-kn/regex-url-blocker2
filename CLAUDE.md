# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

正規表現で指定したURLの表示をブロックするChrome拡張機能。WXT + Vue 3 + TypeScript + Tailwind CSS v4 で構築。要件詳細は [README.md](README.md) 参照（ブロックパターン管理、代替表示、URLごとの1日利用可能時間制限）。

現状は WXT スキャフォールドと UI コンポーネント（[BlockRuleForm](components/BlockRuleForm.vue)、[BlockRuleList](components/BlockRuleList.vue)、[BlockRuleItem](components/BlockRuleItem.vue)）のみ存在。永続化・ブロック判定・時間計測ロジックは未実装で、これらコンポーネントは [OptionsPage.vue](entrypoints/options/OptionsPage.vue) に未接続。

## 主要コマンド

パッケージマネージャは **pnpm**。

```sh
pnpm dev               # 開発モード（拡張機能を自動リロード）
pnpm build             # .output/chrome-mv3 へビルド
pnpm zip               # ストア提出用 zip 作成
pnpm typecheck         # vue-tsc --noEmit
pnpm lint              # ESLint（--max-warnings 0）
pnpm lint:fix          # 自動修正
pnpm test:unit         # Vitest
pnpm test:unit -- path/to/file.test.ts   # 単一ファイル実行
pnpm test:e2e          # wxt build → playwright test
pnpm test:e2e:ui       # Playwright UI モード
```

E2E テストは `.output/chrome-mv3` に既ビルド成果物が必要なため、`pnpm test:e2e` は内部で `wxt build` を先に実行する。E2E のみ単独で動かす場合も先にビルドすること。

## ディレクトリ構成

[WXT の標準](https://wxt.dev/guide/essentials/project-structure.html#project-structure) に従う。

```
regex-url-blocker2/
├─ entrypoints/         # 拡張機能のエントリポイント（命名規則で manifest 種別が決定）
│  ├─ background.ts     # Service Worker
│  ├─ content.ts        # コンテンツスクリプト
│  ├─ options/          # オプション画面（Vue アプリ）
│  └─ popup/            # ポップアップ画面（Vue アプリ）
├─ components/          # 再利用可能な Vue コンポーネント
├─ utils/               # 汎用ロジック（現状空）
├─ assets/              # ビルドにバンドルされる静的ファイル
│  └─ css/tailwind.css  # Tailwind v4 エントリ
├─ public/              # そのまま配布物に出力される静的ファイル（アイコンなど）
├─ test/                # Vitest ユニットテスト
├─ e2e/                 # Playwright E2E テスト（fixtures.ts で拡張機能ロード）
├─ wxt.config.ts        # WXT / manifest 設定
├─ eslint.config.js     # ESLint flat config
├─ playwright.config.ts # Playwright 設定
└─ tailwind.config.js   # Tailwind v3 互換の残骸（v4 では実質未使用）
```

`composables/` は現状未使用。Vue Composition API の共有関数を追加する場合は WXT 標準に従い同名ディレクトリを新設する。

## アーキテクチャ要点

### WXT のエントリポイント方式

`entrypoints/` 配下のディレクトリ／ファイル名が manifest のエントリ種別を決定する（WXT の規約）。新しい画面やスクリプトは命名で追加する：

- [entrypoints/background.ts](entrypoints/background.ts) — Service Worker。`defineBackground` を export する
- [entrypoints/content.ts](entrypoints/content.ts) — content script。`matches` で対象 URL を指定（現在は `*://*.google.com/*` のみ）
- [entrypoints/options/](entrypoints/options/) — オプション画面（Vue アプリ）。manifest の `options_ui.page` で参照
- [entrypoints/popup/](entrypoints/popup/) — ポップアップ画面（Vue アプリ）

各 Vue エントリは `main.ts` で `createApp` し、Tailwind CSS を [assets/css/tailwind.css](assets/css/) から import する。

### manifest 設定

[wxt.config.ts](wxt.config.ts) の `manifest` セクションが Chrome manifest を生成する。permissions は現状空。ストレージや tabs API を使う機能を追加する際は、ここに `storage`、`tabs` などを追加する必要がある。

### Tailwind CSS v4

Vite プラグイン `@tailwindcss/vite` 経由（PostCSS 不使用）。ルートの `tailwind.config.js` は v3 互換の残骸でほぼ未使用。色は **oklch** 色空間で出力されるため、E2E で色アサートする場合は [smoke.spec.ts](e2e/smoke.spec.ts) のように oklch 値で比較する。

### E2E テスト基盤

[e2e/fixtures.ts](e2e/fixtures.ts) で `chromium.launchPersistentContext` により拡張機能をロード。`extensionId` フィクスチャは Service Worker URL から拡張 ID を抽出する。テスト内では `chrome-extension://${extensionId}/options.html` 等で各画面を開く。Playwright は `workers: 1`、`fullyParallel: false`（[playwright.config.ts](playwright.config.ts)）。

## 自動実行されるフック

[.claude/settings.json](.claude/settings.json) で Write/Edit/MultiEdit 後に **`pnpm lint:fix` と `pnpm typecheck`** が PostToolUse フックとして自動実行される。失敗時は exit 2 で編集が止まる。コード編集後に手動で lint/typecheck を回す必要は通常ない。

## コーディング規約

- ESLint は `eslint.configs.recommended` + `typescript-eslint` recommended + `eslint-plugin-vue` flat/recommended + `@stylistic/eslint-plugin` recommended。`.gitignore` を ESLint の ignore 元に再利用している（[eslint.config.js](eslint.config.js)）。
- **lint エラーは `eslint-disable` で抑制せず、コードを直して解消する**。
- パスエイリアス `@/` はプロジェクトルート（WXT 自動生成の [.wxt/tsconfig.json](.wxt/) を継承）。

## 実装ワークフロー

要件を受けて実装する際は、要件をテストで表現することを基本とする。

1. **テスト追加** — 要件を満たすことを検証するテストを追加する
   - ロジック・ユーティリティは [test/](test/) に Vitest テストを追加
   - UI／拡張機能の挙動（画面遷移、表示内容、ブロック発動など）は [e2e/](e2e/) に Playwright テストを追加
2. **実装** — 追加したテストが通るよう実装する
3. **検証** — 完了報告の前に以下を自律的に実行し、失敗があれば修正してから報告する
   - `pnpm test:unit`
   - `pnpm lint`（PostToolUse hook で自動修正済みでも最終確認）
   - `pnpm typecheck`
   - `pnpm test:e2e`（UI／拡張機能の挙動を伴う変更時。純粋なロジック変更時は省略可）
