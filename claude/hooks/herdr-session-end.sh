#!/usr/bin/env bash
# Drops the claude.session label when Claude is exited on purpose, so a
# recovered shell only resumes sessions that were cut off (reboot, core restart).
set -u

[ -n "${HC_TERMINAL_ID:-}" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
reason=$(jq -r '.reason // empty' <<<"$input" 2>/dev/null)
session=$(jq -r 'select(.agent_id == null) | .session_id // empty' <<<"$input" 2>/dev/null)

case "$reason" in
  prompt_input_exit|logout) ;;
  *) exit 0 ;;
esac
[ -n "$session" ] || exit 0

current=$(hc get "$HC_TERMINAL_ID" --json 2>/dev/null | jq -r '.labels["claude.session"] // empty')
[ "$current" = "$session" ] || exit 0

hc label "$HC_TERMINAL_ID" "claude.session=" >/dev/null 2>&1 || true
