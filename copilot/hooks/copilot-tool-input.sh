#!/usr/bin/env bash
# PreToolUse hook: when the agent waits for the user (ask_user -> AskUserQuestion,
# plan review -> exit_plan_mode), show (?) yellow window + input sound and stop the
# spinner. No-op for every other tool.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
hook_is_input_tool || exit 0
hook_play "$hook_sound_input"
hook_render_static input "$hook_marker_input" "$hook_style_input" "$(hook_session_name)"
exit 0
