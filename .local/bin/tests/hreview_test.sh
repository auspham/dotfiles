#!/usr/bin/env bash
set -euo pipefail

hreview="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hreview"
state="$(mktemp -d)"
trap 'rm -rf "$state"' EXIT
export XDG_STATE_HOME="$state"
file="$state/herdr-review/replies.jsonl"
fail() { echo "FAIL: $*" >&2; exit 1; }

HC_TERMINAL_ID=t7 "$hreview" reply cabc123 'Because the "tests" need it.' >/dev/null || fail "a reply from an agent's terminal is recorded"
[ "$(jq -r .id "$file")" = cabc123 ] || fail "records the thread id"
[ "$(jq -r .text "$file")" = 'Because the "tests" need it.' ] || fail "keeps quotes in the answer intact"
[ "$(jq -r .from "$file")" = t7 ] || fail "records which terminal answered"
jq -e '.at | numbers' "$file" >/dev/null || fail "records when it answered"

HC_TERMINAL_ID=t7 "$hreview" reply cabc123 two words >/dev/null || fail "joins an unquoted answer's words"
[ "$(wc -l < "$file" | tr -d ' ')" = 2 ] || fail "appends one line per reply"
[ "$(tail -1 "$file" | jq -r .text)" = "two words" ] || fail "an unquoted answer reads as one text"

if HC_TERMINAL_ID=t7 "$hreview" reply 'bad id!' x 2>/dev/null; then fail "rejects a malformed thread id"; fi
if HC_TERMINAL_ID=t7 "$hreview" reply cabc123 '  ' 2>/dev/null; then fail "rejects an empty answer"; fi
if env -u HC_TERMINAL_ID "$hreview" reply cabc123 x 2>/dev/null; then fail "refuses to answer outside a herdr terminal"; fi
if "$hreview" 2>/dev/null; then fail "prints usage without a command"; fi
[ "$(wc -l < "$file" | tr -d ' ')" = 2 ] || fail "a refused reply writes nothing"

echo "hreview: all checks passed"
