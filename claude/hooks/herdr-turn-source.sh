#!/usr/bin/env bash
# Labels the herdr terminal turn=user or turn=peer so the my-sound mod can keep a coordinator quiet after turns other sessions started.
set -u

[ -n "${HC_TERMINAL_ID:-}" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

prompt=$(jq -r 'select(.agent_id == null) | .prompt // ""' 2>/dev/null) || exit 0
[ -n "$prompt" ] || exit 0

# Why: Claude Code delivers a SendMessage from another session as a prompt wrapped in <cross-session-message ...>; this relies on that format.
turn=user
case "$prompt" in *"<cross-session-message"*) turn=peer ;; esac

hc label "$HC_TERMINAL_ID" "turn=$turn" >/dev/null 2>&1 || true
