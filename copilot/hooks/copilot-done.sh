#!/usr/bin/env bash
# Stop hook: turn complete -> done sound + ✓ green window (stops the spinner).
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
# Ignore Stops fired by subagents (task/research/explore): their session_id is the
# spawning tool-use id (toolu_...), never the main session's UUID. Only the main agent's
# real turn-end should ding + mark the window done.
#
# Do NOT additionally gate this on the TUI footer: at a genuine turn-end the footer can
# take ~1s to re-render the idle prompt, so a footer probe here races the turn-end render
# and can drop the done - which leaves the window stuck "working" until the spinner
# watchdog false-flags it as ✗ cancelled.
case "$(hook_field session_id)" in toolu_*) exit 0 ;; esac
hook_play "$hook_sound_done"
hook_render_static done "$hook_marker_done" "$hook_style_done" "$(hook_session_name)"
exit 0
