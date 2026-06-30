#!/usr/bin/env bash
# Notification hook: input needed (permission prompt / elicitation / system) ->
# (?) yellow window + input sound (stops the spinner).
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
hook_play "$hook_sound_input"
hook_render_static input "$hook_marker_input" "$hook_style_input" "$(hook_session_name)"
exit 0
