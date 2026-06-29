#!/usr/bin/env bash
# Stop hook: ding + rename window to session name + ✓ done marker
input="$(cat 2>/dev/null)"
sid="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"
name="$(printf '%s' "$input" | jq -r '.session_name // empty' 2>/dev/null)"
[ -z "$name" ] && [ -n "$sid" ] && name="$(sqlite3 ~/.copilot/session-store.db "select summary from sessions where id='$sid';" 2>/dev/null)"
name="${name:-copilot}"
canberra-gtk-play -f /usr/share/sounds/freedesktop/stereo/complete.oga >/dev/null 2>&1 || printf '\a'
pane="${TMUX_PANE:-$(tmux display-message -p '#{pane_id}' 2>/dev/null)}"
if [ -n "$pane" ]; then
  win=$(tmux display-message -p -t "$pane" '#{window_id}' 2>/dev/null)
  tmux set-window-option -t "$win" automatic-rename off 2>/dev/null
  tmux rename-window -t "$win" "✓ $name" 2>/dev/null
  tmux set-window-option -t "$win" window-status-style 'bg=green,fg=black' 2>/dev/null
fi
exit 0
