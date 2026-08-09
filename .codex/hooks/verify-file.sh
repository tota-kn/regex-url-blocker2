#!/usr/bin/env bash
# Codex の PostToolUse フック本体。
# Codex は Claude Code の Stop 相当のイベントを持たないため編集ごとの実行を維持するが、
# 編集ファイルの拡張子でゲートし、typecheck は incremental で走らせる。
set -uo pipefail

# Codex には CLAUDE_PROJECT_DIR 相当の環境変数が確認できていないため、
# スクリプト自身の位置からプロジェクトルートを解決する。
cd "$(dirname "$0")/../.." || exit 0

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

BIN=./node_modules/.bin
failed=0

# apply_patch など file_path が取れない場合は全プロジェクトにフォールバックする。
if [ -z "$file" ]; then
  "$BIN/oxlint" --fix 1>&2 || failed=1
  "$BIN/oxfmt" --write 1>&2 || failed=1
  "$BIN/vue-tsc" --noEmit --incremental \
    --tsBuildInfoFile node_modules/.cache/vue-tsc.tsbuildinfo 1>&2 || failed=1
  exit $((failed * 2))
fi

case "$file" in
  *.ts | *.tsx | *.vue | *.js | *.mjs | *.json)
    "$BIN/oxlint" --fix "$file" 1>&2 || failed=1
    "$BIN/oxfmt" --write "$file" 1>&2 || failed=1
    ;;
  *)
    # .md / .css などは lint も typecheck も不要。
    exit 0
    ;;
esac

case "$file" in
  *.ts | *.tsx | *.vue)
    "$BIN/vue-tsc" --noEmit --incremental \
      --tsBuildInfoFile node_modules/.cache/vue-tsc.tsbuildinfo 1>&2 || failed=1
    ;;
esac

exit $((failed * 2))
