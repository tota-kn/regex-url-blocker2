# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

正規表現で指定した URL の表示をブロックする Chrome 拡張機能。WXT + Vue 3 + TypeScript + Tailwind CSS v4 で構築。要件詳細は [SPEC.md](SPEC.md) 参照。

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

E2E は `.output/chrome-mv3` の既ビルド成果物に依存する。`pnpm test:e2e` は内部で `wxt build` を先に走らせるが、Playwright を単独実行する場合は手動でビルドが必要。

## ディレクトリ構成

[WXT の標準](https://wxt.dev/guide/essentials/project-structure.html#project-structure) に従う。`entrypoints/` 配下のディレクトリ／ファイル名が manifest のエントリ種別を決定する。

```
regex-url-blocker2/
├─ entrypoints/         # 拡張機能のエントリポイント
│  ├─ background.ts     # Service Worker（defineBackground を export）
│  ├─ content.ts        # コンテンツスクリプト（matches で対象 URL を指定）
│  ├─ options/          # オプション画面（Vue アプリ、main.ts で createApp）
│  └─ popup/            # ポップアップ画面（Vue アプリ、main.ts で createApp）
├─ components/          # 再利用可能な Vue コンポーネント
├─ utils/               # 汎用ロジック（現状空）
├─ assets/css/tailwind.css  # Tailwind v4 エントリ（各 main.ts から import）
├─ public/              # 配布物にそのまま出力される静的ファイル
├─ test/                # Vitest ユニットテスト
├─ e2e/                 # Playwright E2E テスト（fixtures.ts で拡張機能ロード）
└─ wxt.config.ts        # WXT / manifest 設定
```

## アーキテクチャ要点

### manifest 設定

[wxt.config.ts](wxt.config.ts) の `manifest` セクションが Chrome manifest を生成する。`permissions` は現状空。ストレージや tabs API を使う機能を追加する際は `storage`、`tabs` などを追加する必要がある。

### Tailwind CSS v4

Vite プラグイン `@tailwindcss/vite` 経由（PostCSS 不使用）。色は **oklch** 色空間で出力されるため、E2E で色アサートする場合は [smoke.spec.ts](e2e/smoke.spec.ts) のように oklch 値で比較する。ルート [tailwind.config.js](tailwind.config.js) は v3 互換の残骸で実質未使用。

### E2E テスト基盤

[e2e/fixtures.ts](e2e/fixtures.ts) で `chromium.launchPersistentContext` により拡張機能をロード。`extensionId` フィクスチャは Service Worker URL から拡張 ID を抽出する。テスト内では `chrome-extension://${extensionId}/options.html` 等で各画面を開く。Playwright は `workers: 1`、`fullyParallel: false`。

## 自動実行されるフック

[.claude/settings.json](.claude/settings.json) で Write/Edit/MultiEdit 後に **`pnpm lint:fix` と `pnpm typecheck`** が PostToolUse フックとして自動実行される。失敗時は exit 2 で編集が止まる。

## コーディング規約

- TSDoc コメントは必須。関数／クラス／インターフェースなどの宣言には、JSDoc スタイルの TSDoc コメントで説明を付与すること。
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
