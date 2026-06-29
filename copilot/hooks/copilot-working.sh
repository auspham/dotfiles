#!/usr/bin/env bash
# UserPromptSubmit hook: clear ✓ marker + green, keep name = session name
input="$(cat 2>/dev/null)"
sid="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"
name="$(printf '%s' "$input" | jq -r '.session_name // empty' 2>/dev/null)"
[ -z "$name" ] && [ -n "$sid" ] && name="$(sqlite3 ~/.copilot/session-store.db "select summary from sessions where id='$sid';" 2>/dev/null)"
name="${name:-copilot}"
pane="${TMUX_PANE:-$(tmux display-message -p '#{pane_id}' 2>/dev/null)}"
if [ -n "$pane" ]; then
  win=$(tmux display-message -p -t "$pane" '#{window_id}' 2>/dev/null)
  tmux set-window-option -t "$win" automatic-rename off 2>/dev/null
  tmux rename-window -t "$win" "$name" 2>/dev/null
  tmux set-window-option -u -t "$win" window-status-style 2>/dev/null
fi
exit 0
