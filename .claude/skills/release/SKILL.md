---
name: release
description: Chrome ウェブストア更新のためのリリース作業一式（バージョン bump → CHANGELOG 追記 → リリースコミット → git tag → push → zip 作成）。「ストアをアップデートしたい」「リリースして」「バージョンを上げて zip を作って」と頼まれたときに使う。
---

# リリース手順（Chrome ウェブストア更新）

この拡張機能のリリースは CI がなく、すべてローカルで完結する。zip のアップロードだけが手動作業。

## 前提となる決めごと

- **バージョンの単一の真実は [wxt.config.ts](../../../wxt.config.ts) の `manifest.version`**。`package.json` の `version` は `0.0.0` 固定で使わない（WXT は `manifest.version` の明示指定を優先する）。
- **変更履歴は [docs/CHANGELOG.md](../../../docs/CHANGELOG.md)**。日本語、`## <version>` の直下に `### Added` / `### Changed` / `### Removed` / `### Fixed`。日付もリンクも付けない。新しい順に上へ積む。
- **リリースコミットは `wxt.config.ts` + `docs/CHANGELOG.md` の 2 ファイルだけ**。
- **タグは `v` 接頭辞なしの軽量タグ**（`1.5.0`）。
- **バージョンは minor bump が慣例**。1.0.0 → 1.1.0 → … と minor だけを上げてきており、破壊的変更を含むリリース（1.5.0 の SessionLimit 削除）でも minor に留めた。major を上げるかはユーザーに確認する。

## 手順

### 1. 未コミットの変更を片付ける

`git status` で作業ツリーを確認する。未コミットの変更があれば、**それを今回のリリースに含めるかユーザーに確認**し、含めるなら先に通常の feat/fix コミットとして切る。リリースコミットに混ぜてはいけない。

### 2. 前回タグからの差分を読む

```
git log <前回タグ>..HEAD --format='=== %h %s%n%b' --stat
```

コミット本文（`%b`）に変更理由と破壊的変更の扱いが日本語/英語で詳しく書かれているので、CHANGELOG の文面はここから起こす。

**後のコミットで取り消された変更を Added に載せないこと。** 例: 1.5.0 では `a4398d0` が追加した「RIGHT NOW」パネルを `57c99f8` が削除しているため、Added ではなく Changed に整理の結果として書いた。

### 3. テストを通す

リリース前に必ずグリーンにする。

- `pnpm test:unit run`（`vitest` は watch に入るので `run` を渡す）
- `pnpm test:e2e`（内部で `wxt build` が走る。UI／拡張機能の挙動変更を含むなら必須）

lint / typecheck は Stop フックが自動で担保するため手動実行は不要。

### 4. バージョンを上げる

`wxt.config.ts` の `manifest.version` を書き換える。

### 5. CHANGELOG を追記

`# Changelog` の直下、前バージョンの見出しの上に新しいセクションを挿入する。文体は既存エントリに厳密に合わせる（日本語、「〜しました。」で終わる箇条書き、技術用語や識別子は英語のままインライン）。

**ユーザー向けの変更だけを載せる。** 開発環境のみの変更（フック設定、lint 除外、dead code 削除、エージェント用ドキュメント）は書かない。

**既存データの破棄や自動移行は必ず明記する。** 例: 「保存済みの session limit ルールは読み替えずに破棄し、`storage.local` の `sessionLimitState` も削除します。」

エクスポートスキーマの版数を上げた場合は、import 互換のある版数と合わせて Changed に書く。

### 6. リリースコミット → タグ → push

```
git add wxt.config.ts docs/CHANGELOG.md
git commit -m 'chore(release): <version>'
git tag <version>
git push origin main
git push origin <version>
```

タグの push は忘れやすい。`git push` だけではタグは飛ばない。

### 7. zip 作成

```
pnpm zip
```

`.output/regex-url-guard-<version>-chrome.zip` が生成される。`.output` は gitignore 済み。

### 8. 検証して報告

- `unzip -p .output/regex-url-guard-<version>-chrome.zip manifest.json` でバージョンを確認
- `git ls-remote --tags origin` にタグが現れることを確認

zip の**パスをユーザーへ伝え、Chrome ウェブストアのデベロッパーダッシュボードへの手動アップロードを依頼する**。ここから先は自動化されていない。

## 注意

- ストア掲載用のスクリーンショットは [docs/store-assets/screenshots/](../../../docs/store-assets/screenshots/) にあるが、**UI 変更に追随できておらず古くなりやすい**。リリース時に撮り直すかユーザーに確認し、据え置くなら申し送りとして報告に残す。
- ストア掲載文と `manifest.description` は普段変更しない。機能の位置づけが変わったリリースでは見直しを提案する。
- GitHub Actions は存在しない。リリース関連の CI を前提にした手順を勝手に足さない。
- `web-ext.config.ts` は gitignore されており、`wxt submit` によるストア API 連携は設定されていない。
