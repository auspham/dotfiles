#!/usr/bin/env bash
# Notification hook: only a *pending* permission / elicitation prompt actually needs the
# user -> (?) yellow window + input sound (stops the spinner). Every other notification
# (agent_completed fired once per finished subagent by /research, idle, and the
# *_completed/_response resolutions) must not ding or steal the spinner; if we were
# showing "input" and the wait has since resolved, resume the working spinner.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
hook_lock_window || exit 0
if hook_notification_is_input; then
  hook_play "$hook_sound_input"
  hook_render_static input "$hook_marker_input" "$hook_style_input" "$(hook_session_name)"
elif [ "$(hook_state_read)" = input ]; then
  hook_start_working "$(hook_session_name)"
fi
exit 0
