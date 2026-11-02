#!/usr/bin/env bash
# OpenCode entry point, called by the agent-hooks TUI plugin as `opencode.sh <action>` with
# {"session_id", "session_name"} on stdin. OpenCode reports every turn boundary as an
# event, so unlike the Copilot/Claude hooks nothing here infers state from the pane.
#   working    a root session started (or resumed) executing
#   input      a permission or form is waiting on the user
#   answered   the last pending input was resolved while the session still runs
#   done       a root session finished with no running subagents
#   cancelled  a root session was interrupted or failed
#   title      the root session shown on the window was renamed
source "$HOME/.config/agent-hooks/lib.sh"
action="${1:-}"
hook_read_input
hook_debug
hook_in_tmux || exit 0
hook_lock_window || exit 0
name="$(hook_session_name)"
state="$(hook_state_read)"

# A session ended: finish the window only when no other session in it is still active.
finish() {
  hook_agent_mark_inactive
  if hook_agents_active; then
    case "$state" in
      working|input) ;;
      *) hook_start_working "$name" ;;
    esac
    return
  fi
  case "$1" in
    done)
      hook_render_static done "$hook_marker_done" "$hook_style_done" "$name"
      hook_play "$hook_sound_done"
      ;;
    cancelled)
      hook_render_static cancelled "$hook_marker_cancel" "$hook_style_cancel" "$name"
      ;;
  esac
}

case "$action" in
  working)
    hook_agent_mark_active
    hook_start_working "$name"
    ;;
  input)
    hook_agent_mark_active
    hook_render_static input "$hook_marker_input" "$hook_style_input" "$name"
    [ "$state" = input ] || hook_play "$hook_sound_input"
    ;;
  answered)
    [ "$state" = input ] && hook_start_working "$name"
    ;;
  done|cancelled)
    finish "$action"
    ;;
  title)
    case "$state" in
      working) hook_start_working "$name" ;;
      input) hook_render_static input "$hook_marker_input" "$hook_style_input" "$name" ;;
      done) hook_render_static done "$hook_marker_done" "$hook_style_done" "$name" ;;
      cancelled) hook_render_static cancelled "$hook_marker_cancel" "$hook_style_cancel" "$name" ;;
    esac
    ;;
esac
exit 0
