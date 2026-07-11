---
name: plan-and-implement
description: 要件を planner エージェント（Opus）で計画し、その計画を implementer エージェント（Sonnet）で実装させる二段構えのワークフロー。「planner で計画して implementer に実装させて」「計画→実装で進めて」と頼まれたとき、または新機能・改修の実装依頼を計画と実装に分けて進めたいときに使う。
---

# Plan → Implement ワークフロー

要件を **planner（Opus）で計画** → **implementer（Sonnet）で実装** の二段で進める。
計画と実装を別モデル・別コンテキストのサブエージェントに分担させるための段取り。
implementer は advisor（Fable）を継承しており、実装中に詰まった局面では自動で Fable に相談する（手動ルーティングは不要）。

## 手順

### 1. 要件を確定する

- ユーザーの依頼が曖昧なら、実装に入る前にこの場で確認する（何を・どこに・受け入れ条件）。
- `$ARGUMENTS` に要件が渡されていればそれを起点にする。

### 2. planner エージェントを起動（Fable）

- `Agent` ツールで `subagent_type: "planner"` を起動する。
- プロンプトには **要件の全文** と、planner が repo を読めるだけの文脈（対象機能・関連しそうな領域）を渡す。planner はコールドスタートなので、この会話で分かっている前提を明示的に書くこと。
- planner には「影響ファイル・テスト方針・手順・トレードオフ」を含む計画を返させる。
- **同期実行**（`run_in_background: false`）にして計画を受け取ってから次へ進む。

### 3. 計画をユーザーに提示して合意を取る

- planner の計画を要約してユーザーに見せる。
- 実装に進んでよいか確認する。修正指示があれば planner に差し戻す（同じエージェントを `SendMessage` で継続すると文脈が残る）。

### 4. implementer エージェントを起動（Sonnet）

- 合意後、`Agent` ツールで `subagent_type: "implementer"` を起動する。
- プロンプトには **planner の計画全文** をそのまま渡す（implementer もコールドスタート）。
- implementer にテスト先行で実装させ、`pnpm test:unit` / `pnpm lint` / `pnpm typecheck`（UI/挙動変更時は `pnpm test:e2e`）まで通させる。

### 5. 結果を報告

- implementer の変更ファイルと検証結果を、正直に（失敗・スキップも含めて）ユーザーへ伝える。

## 注意

- planner はコードを書かない。implementer が書く。役割を混ぜない。
- 各エージェントはコールドスタートのため、この会話でしか知り得ない前提は毎回プロンプトに明示する。
- 実装を Opus で回したい指示があれば、implementer 起動時に `model: "opus"` で上書きする。
- implementer が詰まったときの相談は advisor（fable）がネイティブに担う。Skill 側で「詰まったら相談」の手動ループを組んではいけない。
- 小さすぎる変更（数行の修正など）はこのワークフローを使わず、直接実装した方が速い場合がある。その旨をユーザーに伝えて選ばせてよい。
