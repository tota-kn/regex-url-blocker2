# プロジェクト情報

## プロジェクト概要
正規表現で指定したURLの表示をブロックするChrome拡張機能

## 技術スタック

- pnpm: パッケージマネージャ
- WXT: Vue用の拡張機能開発フレームワーク
- Vue 3: UIコンポーネント構築
- Chrome Extension API: ブックマークの操作
- Tailwind: スタイル指定
- Vite: ビルド&テストツール

## ディレクトリ構成
[WXTの標準に従う](https://wxt.dev/guide/essentials/project-structure.html#project-structure)ディレクトリ構成を採用しています。

```
extention-bookmark-tag/
├─ entrypoints/         # 拡張機能のエントリーポイント
│  ├─ popup/            # ポップアップUI関連ファイル
│  ├─ options/          # オプション画面関連ファイル
│  └─ background.ts       # バックグラウンド処理のスクリプト
│  └─ content.ts       # コンテンツ処理のスクリプト
├─ components/          # 再利用可能なVueコンポーネント
├─ composables/         # 共有可能なVue Composition API関数
├─ assets/              # 画像などの静的ファイル
├─ utils/              # 汎用的な共通処理
├─ wxt.config.ts        # WXT設定ファイル
├─ package.json         # 依存関係定義
└─ README.md            # プロジェクト説明
```

## 開発環境セットアップ

```bash
# 依存パッケージのインストール
pnpm install

# 開発サーバーの起動
pnpm dev

# ビルド
pnpm build
```

## 動作確認

コード変更後は以下のコマンドを順番に実行し、すべてパスすることを確認してください。

```bash
# 型チェック
pnpm typecheck

# Lint（warningもエラー扱い）
pnpm lint

# ユニットテスト
pnpm test:unit

# ビルド確認（E2Eテストの前提）
pnpm build
```

### 自律的な検証ルール

実装完了の判断基準:
1. `pnpm typecheck` — TypeScriptエラーが0件
2. `pnpm lint` — ESLintエラー・warningが0件
3. `pnpm test:unit --run` — すべてのユニットテストがパス
4. `pnpm build` — ビルドが成功する

> `pnpm dev` はインタラクティブな開発サーバーのため自律チェックには使用しない。
> E2Eテスト（`pnpm test:e2e`）はブラウザ環境が必要な場合のみ実行する。


## TypeScript
各変数、関数の先頭にその機能を説明するTSDocコメントを使用しましょう

## Vue
- HTML要素のスタイリングには必ずTailwindクラスを使用し、CSSやタグは避けてください。
- 常にComposition APIを使用してください。
- 変数や関数/定数には説明的な名前を使用してください。また、イベント関数には「handle」を接頭辞として付けてください。例えば、onClickには「handleClick」、onKeyDownには「handleKeyDown」などです。
- 要素にはアクセシビリティ機能を実装してください。例えば、aタグにはtabindex="0"、aria-label、on:click、on:keydownなどの属性を設定してください。
- 関数ではなく定数を使用してください。例えば「const toggle = () =>」のようにします。また、可能であれば型も定義してください。

---

これらのガイドラインに従って、高品質のコードを作成し、コーディングスキルを向上させましょう。質問や明確にしたいことがあれば、遠慮なく聞いてください！
