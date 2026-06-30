#!/usr/bin/env bash
# PostToolUse hook: once ask_user (wire name "AskUserQuestion") returns an answer,
# clear the (?) mark and restore the plain working window. No-op for every other tool.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
case "$HOOK_INPUT" in
  *'"AskUserQuestion"'*) ;;
  *) exit 0 ;;
esac
[ "$(hook_field tool_name)" = "AskUserQuestion" ] || exit 0
hook_mark "" "-" "$(hook_session_name)"
exit 0
