#!/usr/bin/env bash
# Tells a Claude agent its role in its herdr space (coordinator, child or peer), which other agents
# share the space, and how to message them. Runs on SessionStart (always) and UserPromptSubmit (only
# when the group changed). Peers come from herdr-core joined with Claude's own session registry.
set -u

[ -n "${HC_TERMINAL_ID:-}" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
# shellcheck source=herdr-team-role.sh
. "$(dirname "${BASH_SOURCE[0]}")/herdr-team-role.sh"

input=$(cat)
event=$(jq -r '.hook_event_name // empty' <<<"$input" 2>/dev/null)
# A sub-agent has an agent_id and shares its parent's terminal, so only the main session speaks.
session=$(jq -r 'select(.agent_id == null) | .session_id // empty' <<<"$input" 2>/dev/null)
[ -n "$session" ] || exit 0
case "$event" in SessionStart | UserPromptSubmit) ;; *) exit 0 ;; esac

sessions_dir="${CLAUDE_SESSIONS_DIR:-$HOME/.claude/sessions}"
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-team"
preferences="${COORDINATOR_PREFERENCES:-$HOME/.claude/coordinator/preferences.md}"

# Live sessions by id: name and busy/idle. The .key files beside them hold credentials and are never read.
registry='{}'
if compgen -G "$sessions_dir/*.json" >/dev/null; then
  registry=$(jq -s 'map(select(.sessionId != null)) | map({key: .sessionId, value: {name: .name, status: .status}}) | from_entries' "$sessions_dir"/*.json 2>/dev/null || echo '{}')
fi

# One JSON object per Claude terminal: where it is, what it works on and its role.
terminals=$(
  for t in $(hc ls --json 2>/dev/null | jq -r '.terminals[]? | select(.agent == "claude-code") | .address'); do
    hc get "$t" --json 2>/dev/null | jq -c '{address, space: .labels["herdr.space"], where: .labels.where, session: .labels["claude.session"], role: (.labels.role // ""), coord: (.labels.coord // ""), title: (.title // ""), folder: (.foreground.cwd // .cwd // "")}'
  done | jq -s '.'
)

own=$(jq -c --arg me "$session" 'map(select(.session == $me)) | first // empty' <<<"$terminals")
[ -n "$own" ] || exit 0
space=$(jq -r '.space' <<<"$own")
own_role=$(jq -r '.role' <<<"$own")
live=$(jq -c --arg me "$session" --arg space "$space" --argjson reg "$registry" 'map(select(.space == $space and .session != $me and $reg[.session] != null))' <<<"$terminals")

role="$own_role"
if [ "$event" = SessionStart ]; then
  has_others=$(jq -r 'length > 0' <<<"$live")
  role=$(decide_role "$own_role" "$has_others")
  if [ "$role" != "$own_role" ]; then
    labels=("role=$role")
    [ "$role" != child ] || labels+=("coord=${HERDR_COORD:-}")
    hc label "$HC_TERMINAL_ID" "${labels[@]}" >/dev/null 2>&1 || true
  fi
fi

coord_terminal=$(jq -r '.coord' <<<"$own")
[ "$role" != child ] || coord_terminal="${HERDR_COORD:-$coord_terminal}"
coord_name=$(jq -r --arg t "$coord_terminal" --argjson reg "$registry" '(map(select(.address == $t)) | first | .session) as $s | if $s == null then empty else $reg[$s].name // empty end' <<<"$live")

roster=$(jq -r --argjson reg "$registry" --argjson max 8 '
  .[:$max] | map("- \($reg[.session].name) [\(.address)] (herdr \(.where // "?")) \($reg[.session].status // "unknown")\(if .role == "coordinator" then " (coordinator)" elif .role == "child" then " (child)" else "" end): \(.title[:60]), in \(.folder | split("/") | last)") | join("\n")' <<<"$live")
own_name=$(jq -rn --argjson reg "$registry" --arg me "$session" '$reg[$me].name // "unnamed"')
space_name=$(jq -r '(.where // "this space") | split(" / ")[0]' <<<"$own")

context=""
if [ -n "$roster" ] || [ "$role" = coordinator ]; then
  context="You are one of several Claude agents sharing the herdr space \"$space_name\". You are $own_name (terminal $HC_TERMINAL_ID)."
  [ -z "$roster" ] || context+=$'\n'"Peers right now (status as of when this was written; ListAgents shows it live):"$'\n'"$roster"
  case "$role" in
    child) context+=$'\n'"$(child_protocol "$coord_name" "$coord_terminal")" ;;
    coordinator) prefs=""; [ ! -f "$preferences" ] || prefs=$(head -c 3000 "$preferences"); context+=$'\n'"$(coordinator_charter "$prefs")" ;;
    *) context+=$'\n'"$(peer_protocol)" ;;
  esac
fi

# What identifies the group, so a prompt only repeats the context when someone joined or left.
signature="$role|$(jq -r 'map(.session + ":" + .role) | sort | join(",")' <<<"$live")"
mkdir -p "$state_dir"
previous=$(cat "$state_dir/$session.sig" 2>/dev/null || true)
printf '%s' "$signature" > "$state_dir/$session.sig"

[ -n "$context" ] || exit 0
[ "$event" = SessionStart ] || [ "$signature" != "$previous" ] || exit 0

jq -n --arg event "$event" --arg text "$context" '{hookSpecificOutput: {hookEventName: $event, additionalContext: $text}}'
