#!/usr/bin/env bash
# Self-terminating per-window spinner for working and finishing states.
# "finishing" keeps the window active after agentStop until Copilot's TUI reports idle,
# which includes background shell commands that outlive the model turn.
#
# It also acts as a cancel/error watchdog: copilot fires no hook when a turn is
# cancelled by the user (esc) or aborts with an error, so when the copilot TUI stops
# showing its "esc cancel" footer while our state is still "working", the turn ended
# abnormally and we flip the window to the red cancelled marker instead of spinning
# forever.
source "$HOME/.copilot/hooks/lib.sh"
win="$1"; name="${2:-copilot}"; gen="$3"; pane="${4:-}"
[ -n "$win" ] || exit 0
mkdir -p "$hook_state_dir" 2>/dev/null
pidf="$(hook_pid_file "$win")"; statef="$(hook_state_file "$win")"
echo "$$" > "$pidf"

[ -n "$pane" ] || pane="$(tmux display-message -p -t "$win" '#{pane_id}' 2>/dev/null)"

# Watchdog tunables (frames @ ~0.12s): don't probe until the TUI has had time to
# render its footer, then probe every few frames and require consecutive idle reads.
grace="${hook_cancel_grace_frames:-16}"       # ~2.0s startup grace
check_every="${hook_cancel_check_frames:-6}"  # ~0.7s between footer probes
need_idle="${hook_cancel_idle_hits:-2}"       # consecutive idle probes to confirm

read -ra frames <<< "$hook_spinner_frames"; n=${#frames[@]}
exec 9<> <(:) 2>/dev/null            # never-ready fd: sub-second wait without spawning sleep
i=0
max="${hook_spinner_max_frames:-720000}"  # ~24h at the default frame delay
idle_hits=0
while [ "$i" -lt "$max" ]; do
  read -r st g _ < "$statef" 2>/dev/null || break
  case "$st" in
    working|finishing) [ "$g" = "$gen" ] || break ;;
    *) break ;;
  esac
  tmux rename-window -t "$win" "${frames[i % n]} $name" 2>/dev/null || break

  if [ -n "$pane" ] && [ "$i" -ge "$grace" ] && [ $(( i % check_every )) -eq 0 ]; then
    if hook_pane_working "$pane"; then
      idle_hits=0
    else
      idle_hits=$(( idle_hits + 1 ))
      if [ "$idle_hits" -ge "$need_idle" ]; then
        if hook_lock_window_id "$win"; then
          # Re-read state: a terminal hook or newer spinner may have won meanwhile.
          read -r st2 g2 _ < "$statef" 2>/dev/null
          if [ "$g2" = "$gen" ]; then
            case "$st2" in
              working)
                hook_agents_clear "$win"
                hook_state_write "$win" cancelled
                hook_rename "$win" "$hook_marker_cancel $name"
                hook_set_style "$win" "$hook_style_cancel"
                ;;
              finishing)
                hook_state_write "$win" done
                hook_rename "$win" "$hook_marker_done $name"
                hook_set_style "$win" "$hook_style_done"
                hook_play "$hook_sound_done"
                ;;
            esac
          fi
          hook_unlock_window
        fi
        break
      fi
    fi
  fi

  i=$(( i + 1 ))
  read -t "$hook_spinner_delay" -u 9 _ 2>/dev/null || true
done

if [ "$i" -ge "$max" ] && hook_lock_window_id "$win"; then
  read -r st2 g2 _ < "$statef" 2>/dev/null
  if [ "$g2" = "$gen" ]; then
    case "$st2" in
      working|finishing)
        hook_agents_clear "$win"
        hook_state_write "$win" cancelled
        hook_rename "$win" "$hook_marker_cancel $name"
        hook_set_style "$win" "$hook_style_cancel"
        ;;
    esac
  fi
  hook_unlock_window
fi

rm -f "$pidf" 2>/dev/null
exit 0
