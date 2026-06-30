#!/usr/bin/env bash
# Stop hook: completion ding + ✓ green window named after the session.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_play "$hook_sound_done"
hook_mark "✓" "bg=green,fg=black" "$(hook_session_name)"
exit 0
