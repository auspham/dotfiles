#!/usr/bin/env bash
# Stop hook: remove this agent and finish only when the window has no active agents.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
hook_lock_window || exit 0
hook_agent_mark_inactive
state="$(hook_state_read)"
if hook_agents_active; then
  case "$state" in
    working|input) ;;
    *) hook_start_working "$(hook_session_name)" ;;
  esac
  exit 0
fi
case "$state" in
  done|cancelled) exit 0 ;;
esac
hook_play "$hook_sound_done"
hook_render_static done "$hook_marker_done" "$hook_style_done" "$(hook_session_name)"
exit 0
