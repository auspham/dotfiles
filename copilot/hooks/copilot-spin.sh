#!/usr/bin/env bash
# Self-terminating per-window "working" spinner, launched detached by hook_start_working.
# Renders braille frames into the window name until the per-window state file leaves
# "working" (or its generation token is superseded, or the window disappears).
source "$HOME/.copilot/hooks/lib.sh"
win="$1"; name="${2:-copilot}"; gen="$3"
[ -n "$win" ] || exit 0
mkdir -p "$hook_state_dir" 2>/dev/null
pidf="$(hook_pid_file "$win")"; statef="$(hook_state_file "$win")"
echo "$$" > "$pidf"

read -ra frames <<< "$hook_spinner_frames"; n=${#frames[@]}
exec 9<> <(:) 2>/dev/null            # never-ready fd: sub-second wait without spawning sleep
i=0; max=20000                       # safety cap (~40 min) against orphans
while [ "$i" -lt "$max" ]; do
  read -r st g _ < "$statef" 2>/dev/null || break
  { [ "$st" = working ] && [ "$g" = "$gen" ]; } || break
  tmux rename-window -t "$win" "${frames[i % n]} $name" 2>/dev/null || break
  i=$(( i + 1 ))
  read -t "$hook_spinner_delay" -u 9 _ 2>/dev/null || true
done
rm -f "$pidf" 2>/dev/null
exit 0
