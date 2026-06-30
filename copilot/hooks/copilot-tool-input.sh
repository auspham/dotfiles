#!/usr/bin/env bash
# PreToolUse hook: when the agent waits for the user (ask_user -> AskUserQuestion,
# plan review -> exit_plan_mode), signal "input needed" ((?) yellow window + sound).
# No-op for every other tool.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_is_input_tool || exit 0
hook_play "$hook_sound_input"
hook_mark "(?)" "bg=yellow,fg=black" "$(hook_session_name)"
exit 0
