#!/usr/bin/env bash
set -u

[ -n "${HC_TERMINAL_ID:-}" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

session=$(jq -r 'select(.agent_id == null) | .session_id // empty' 2>/dev/null)
[ -n "$session" ] || exit 0

hc label "$HC_TERMINAL_ID" "claude.session=$session" >/dev/null 2>&1 || true
