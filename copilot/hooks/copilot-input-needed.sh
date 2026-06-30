#!/usr/bin/env bash
# Notification hook: input needed (permission prompt / elicitation / system).
# Distinct question sound + ❓ yellow window.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_play window-question.oga
hook_mark "❓" "bg=yellow,fg=black" "$(hook_session_name)"
exit 0
