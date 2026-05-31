# 仕様

URL pattern で指定した URL に対して **1日あたりの閲覧時間** と **時間帯** を制限する Chrome 拡張機能。制限を超過すると別途設定したリダイレクト URL（デフォルト `https://example.com`）へ遷移するか、拡張機能が用意するブロックページを表示する。

## 読み分け

- [domain.md](domain.md): 用語、グループ、グローバル設定、閲覧時間計測、ブロック判定、URL pattern、リセット、ブロック遷移、設定反映、通知・badge
- [ui.md](ui.md): Options / Popup / Blocked 画面要件
- [storage.md](storage.md): `storage.sync` / `storage.local`、有効設定、export/import
- [permissions.md](permissions.md): manifest permissions
- [non-goals.md](non-goals.md): v1 非要件

## 関連ドキュメント

- [DESIGN.md](../../DESIGN.md): UI の視覚的アイデンティティとデザイントークン
- [CLAUDE.md](../../CLAUDE.md): このリポジトリで作業するエージェント向けガイド
