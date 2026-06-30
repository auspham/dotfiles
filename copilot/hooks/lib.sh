#!/usr/bin/env bash
# Shared helpers for Copilot CLI tmux/sound hooks.
# Source this, then call hook_read_input once and use the helpers below.

copilot_db="$HOME/.copilot/session-store.db"
sound_dir="/usr/share/sounds/freedesktop/stereo"

hook_read_input() {
  HOOK_INPUT="$(cat 2>/dev/null)"
}

hook_field() {
  printf '%s' "$HOOK_INPUT" | jq -r --arg k "$1" '.[$k] // empty' 2>/dev/null
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
  printf '%s' "$1" | sed -E 's/^(\xE2\x9C\x93|\xE2\x9D\x93) //'
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

# hook_mark <marker|""> <style|"-"> <name>
# marker "" -> no prefix; style "-" -> unset window-status-style.
hook_mark() {
  local marker="$1" style="$2" name="$3" win
  win="$(hook_window_id)"
  [ -z "$win" ] && return 0
  name="${name:-copilot}"
  tmux set-window-option -t "$win" automatic-rename off 2>/dev/null
  if [ -n "$marker" ]; then
    tmux rename-window -t "$win" "$marker $name" 2>/dev/null
  else
    tmux rename-window -t "$win" "$name" 2>/dev/null
  fi
  if [ "$style" = "-" ]; then
    tmux set-window-option -u -t "$win" window-status-style 2>/dev/null
  else
    tmux set-window-option -t "$win" window-status-style "$style" 2>/dev/null
  fi
}
