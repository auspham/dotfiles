#!/usr/bin/env bash
# PreToolUse hook: when the agent calls ask_user (wire name "AskUserQuestion"),
# signal "input needed" (question sound + ❓ yellow window). No-op for every other tool.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
case "$HOOK_INPUT" in
  *'"AskUserQuestion"'*) ;;
  *) exit 0 ;;
esac
[ "$(hook_field tool_name)" = "AskUserQuestion" ] || exit 0
hook_play window-question.oga
hook_mark "❓" "bg=yellow,fg=black" "$(hook_session_name)"
exit 0
