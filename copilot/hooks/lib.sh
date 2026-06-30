#!/usr/bin/env bash
# Shared helpers for Copilot CLI tmux/sound hooks.
# Source this, then call hook_read_input once and use the helpers below.

copilot_db="$HOME/.copilot/session-store.db"
sound_dir="/usr/share/sounds/freedesktop/stereo"

# Sounds (freedesktop .oga names under $sound_dir).
hook_sound_input="bell.oga"                # input needed: ask_user / plan review
hook_sound_done="complete.oga"             # turn complete

# Tools that mean "agent is waiting on the user" (names as seen in hook payloads).
hook_input_tools="AskUserQuestion exit_plan_mode"

# Window-status styles per state (tmux style strings) and static markers.
hook_style_working="bg=blue,fg=white"
hook_style_input="bg=yellow,fg=black"
hook_style_done="bg=green,fg=black"
hook_marker_input="(?)"
hook_marker_done="✓"

# Working spinner: space-separated frames + frame delay (~8 fps).
hook_spinner_frames="⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏"
hook_spinner_delay="0.12"

# Per-window hook state (state + pid files), keyed by tmux window id.
hook_state_dir="${XDG_RUNTIME_DIR:-/tmp}/copilot-hooks"

hook_read_input() {
  HOOK_INPUT="$(cat 2>/dev/null)"
}

# Append the raw hook payload to debug.log when ~/.copilot/hooks/.debug exists.
hook_debug() {
  [ -e "$HOME/.copilot/hooks/.debug" ] || return 0
  printf '%s | %s\n' "$(date '+%F %T')" "$HOOK_INPUT" >> "$HOME/.copilot/hooks/debug.log"
}

hook_field() {
  printf '%s' "$HOOK_INPUT" | jq -r --arg k "$1" '.[$k] // empty' 2>/dev/null
}

# True when the current tool_name is one of $hook_input_tools.
hook_is_input_tool() {
  local t; t="$(hook_field tool_name)"
  [ -n "$t" ] || return 1
  case " $hook_input_tools " in *" $t "*) return 0 ;; esac
  return 1
}

hook_pane() {
  printf '%s' "${TMUX_PANE:-$(tmux display-message -p '#{pane_id}' 2>/dev/null)}"
}

hook_window_id() {
  local pane
  pane="$(hook_pane)"
  [ -n "$pane" ] && tmux display-message -p -t "$pane" '#{window_id}' 2>/dev/null
}

hook_strip_marker() {
  printf '%s' "$1" | LC_ALL=C sed -E 's/^(\xE2\x9C\x93|\xE2\x9D\x93|\(\?\)|\xE2[\xA0-\xA3][\x80-\xBF]) //'
}

# Resolve a display name: stdin session_name -> db summary -> current window name -> copilot.
hook_session_name() {
  local name sid win
  name="$(hook_field session_name)"
  if [ -z "$name" ]; then
    sid="$(hook_field session_id)"
    [ -n "$sid" ] && name="$(sqlite3 "$copilot_db" "select summary from sessions where id='$sid';" 2>/dev/null)"
  fi
  if [ -z "$name" ]; then
    win="$(hook_window_id)"
    [ -n "$win" ] && name="$(hook_strip_marker "$(tmux display-message -p -t "$win" '#{window_name}' 2>/dev/null)")"
  fi
  printf '%s' "${name:-copilot}"
}

hook_play() {
  canberra-gtk-play -f "$sound_dir/$1" >/dev/null 2>&1 || printf '\a'
}

hook_state_file() { printf '%s/%s.state' "$hook_state_dir" "${1#@}"; }
hook_pid_file()   { printf '%s/%s.pid'   "$hook_state_dir" "${1#@}"; }

# Write "<state> [gen]" for a window (state: working|input|done|idle).
hook_state_write() {
  mkdir -p "$hook_state_dir" 2>/dev/null
  printf '%s %s\n' "$2" "${3:-}" > "$(hook_state_file "$1")"
}

# Bounded wait (<=~0.3s) until the spinner for a window has removed its pid file.
hook_spin_wait_stopped() {
  local p i; p="$(hook_pid_file "$1")"
  for i in 1 2 3 4 5 6; do [ -e "$p" ] || return 0; sleep 0.05; done
}

hook_rename() {
  tmux set-window-option -t "$1" automatic-rename off 2>/dev/null
  tmux rename-window -t "$1" "$2" 2>/dev/null
}

# Set or (with "-") unset the window-status-style.
hook_set_style() {
  if [ "$2" = "-" ]; then
    tmux set-window-option -u -t "$1" window-status-style 2>/dev/null
  else
    tmux set-window-option -t "$1" window-status-style "$2" 2>/dev/null
  fi
}

# Stop any spinner, then statically render "<marker> <name>" with <style>.
# hook_render_static <state> <marker|""> <style|"-"> <name>
hook_render_static() {
  local win; win="$(hook_window_id)"; [ -z "$win" ] && return 0
  hook_state_write "$win" "$1"
  hook_spin_wait_stopped "$win"
  hook_rename "$win" "${2:+$2 }${4:-copilot}"
  hook_set_style "$win" "$3"
}

# Enter "working": stop any old spinner, then launch a fresh self-terminating one.
# hook_start_working <name>
hook_start_working() {
  local win gen; win="$(hook_window_id)"; [ -z "$win" ] && return 0
  hook_state_write "$win" "idle"
  hook_spin_wait_stopped "$win"
  gen="$$$RANDOM$RANDOM"
  hook_state_write "$win" "working" "$gen"
  tmux set-window-option -t "$win" automatic-rename off 2>/dev/null
  hook_set_style "$win" "$hook_style_working"
  setsid bash "$HOME/.copilot/hooks/copilot-spin.sh" "$win" "${1:-copilot}" "$gen" >/dev/null 2>&1 &
}
