#!/usr/bin/env bash
# Notification hook: input needed (permission prompt / elicitation / system).
# (?) yellow window + input sound.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_play "$hook_sound_input"
hook_mark "(?)" "bg=yellow,fg=black" "$(hook_session_name)"
exit 0
