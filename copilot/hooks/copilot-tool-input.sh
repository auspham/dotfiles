#!/usr/bin/env bash
# PreToolUse hook: input tools (ask_user -> AskUserQuestion, plan review ->
# exit_plan_mode) show (?) + sound and stop the spinner. Any other tool, if the
# window is stuck in "input" (e.g. after a notification), resumes the spinner.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
if hook_is_input_tool; then
  hook_play "$hook_sound_input"
  hook_render_static input "$hook_marker_input" "$hook_style_input" "$(hook_session_name)"
elif [ "$(hook_state_read)" = input ]; then
  hook_start_working "$(hook_session_name)"
fi
exit 0
