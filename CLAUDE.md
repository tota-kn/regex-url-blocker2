# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and Codex when working with code in this repository.

## プロジェクト概要

正規表現で指定した URL の表示をブロックする Chrome 拡張機能。WXT + Vue 3 + TypeScript + Tailwind CSS v4 で構築。

- **デザインシステム**: [DESIGN.md](DESIGN.md) に UI の視覚的アイデンティティを定義。YAML フロントマターにデザイントークン（色・タイポグラフィ・角丸・スペーシング・コンポーネント）を、Markdown 本文に設計思想と適用ガイドラインを記載する。UI を変更・追加する際はこのファイルに従うこと。

## 主要コマンド

パッケージマネージャは **pnpm**。スクリプト一覧は [package.json](package.json) の `scripts` を参照。

E2E は `.output/chrome-mv3` の既ビルド成果物に依存する。`pnpm test:e2e` は内部で `wxt build` を先に走らせるが、Playwright を単独実行する場合は手動でビルドが必要。

## ディレクトリ構成

[WXT の標準](https://wxt.dev/guide/essentials/project-structure.html#project-structure) に従う。`entrypoints/` 配下のディレクトリ／ファイル名が manifest のエントリ種別を決定する。

## アーキテクチャ要点

### Tailwind CSS v4

Vite プラグイン `@tailwindcss/vite` 経由（PostCSS 不使用）。色は **oklch** 色空間で出力されるため、E2E で色アサートする場合はブラウザが返す計算済みスタイルの値に合わせて比較する。

## 自動実行されるフック

Claude Code は [.claude/settings.json](.claude/settings.json) で Write/Edit/MultiEdit 後に **`pnpm lint:fix`（Oxlint + Oxfmt）と `pnpm typecheck`** が PostToolUse フックとして自動実行される。Codex でも同等の PostToolUse フックを設定する。失敗時は exit 2 で編集が止まる。

## コーディング規約

- TSDoc コメントは必須。関数／クラス／インターフェースなどの宣言には、JSDoc スタイルの TSDoc コメントで説明を付与すること。

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
