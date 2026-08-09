#!/usr/bin/env bash
# Claude Code の Stop フック本体。
# ターン終了時に lint / format / typecheck をまとめて 1 回だけ実行し、
# 失敗した場合は exit 2 でターン終了をブロックしてエラーを Claude に返す。
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

input=$(cat)
session=$(printf '%s' "$input" | jq -r '.session_id // "default"')
counter="${TMPDIR:-/tmp}/rub2-verify-hook-${session}.count"

BIN=./node_modules/.bin
failed=0

# 途中で打ち切らず全て実行する。1 回の往復で全エラーを返すため。
"$BIN/oxlint" --fix 1>&2 || failed=1
"$BIN/oxfmt" --write 1>&2 || failed=1
"$BIN/vue-tsc" --noEmit --incremental \
  --tsBuildInfoFile node_modules/.cache/vue-tsc.tsbuildinfo 1>&2 || failed=1

if [ "$failed" -eq 0 ]; then
  rm -f "$counter"
  exit 0
fi

# 検証が通るまで繰り返しブロックする。ただし連続 3 回で打ち切る。
n=$(($(cat "$counter" 2>/dev/null || echo 0) + 1))
printf '%s' "$n" >"$counter"
if [ "$n" -ge 3 ]; then
  rm -f "$counter"
  echo "検証が 3 回連続で失敗したためブロックを解除しました。手動で確認してください。" 1>&2
  exit 0
fi

exit 2
