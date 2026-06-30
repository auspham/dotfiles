#!/usr/bin/env bash
# Stop hook: turn complete -> done sound + ✓ green window (stops the spinner).
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_play "$hook_sound_done"
hook_render_static done "$hook_marker_done" "$hook_style_done" "$(hook_session_name)"
exit 0
