#!/usr/bin/env bash
# Stop hook: turn complete -> done sound + ✓ green window (stops the spinner).
# Subagents (task/research/explore) each fire their own Stop while the main turn is still
# running; only the end of the *visible* turn shows copilot's idle footer. Ignore any Stop
# where the TUI is still busy, so a finishing subagent can't prematurely mark the window
# done, play the completion sound, or kill the working spinner.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
# Ignore Stops fired by subagents (task/research/explore): their session_id is the
# spawning tool-use id (toolu_...), never the main session's UUID. Also ignore any Stop
# while the TUI is still busy - the visible turn hasn't ended yet. Either way a finishing
# subagent must not play the done sound, mark the window ✓, or kill the working spinner.
case "$(hook_field session_id)" in toolu_*) exit 0 ;; esac
hook_wait_idle "$(hook_pane)" || exit 0
hook_play "$hook_sound_done"
hook_render_static done "$hook_marker_done" "$hook_style_done" "$(hook_session_name)"
exit 0
