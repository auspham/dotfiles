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
# Written by the Team panel's Coordinator mode switch, per space.
settings="${HERDR_TEAM_SETTINGS:-$HOME/.config/herdr-team/coordinator.json}"
spaces_dir="${COORDINATOR_HOME:-$HOME/.claude/coordinator}/spaces"

# Live sessions by id: name and busy/idle. The .key files beside them hold credentials and are never read.
registry='{}'
if compgen -G "$sessions_dir/*.json" >/dev/null; then
  registry=$(for f in "$sessions_dir"/*.json; do jq -c 'select(.sessionId != null) | {key: .sessionId, value: {name: .name, status: .status}}' "$f" 2>/dev/null; done | jq -s 'from_entries' 2>/dev/null || echo '{}')
fi

# One JSON object per Claude terminal: where it is, what it works on and its role.
terminals=$(
  for t in $(hc ls --json 2>/dev/null | jq -r '.terminals[]? | select(.agent == "claude-code") | .address'); do
    hc get "$t" --json 2>/dev/null | jq -c '{address, space: .labels["herdr.space"], where: .labels.where, session: .labels["claude.session"], role: (.labels.role // ""), coord: (.labels.coord // ""), owner: (.labels.owner // ""), title: (.title // ""), folder: (.foreground.cwd // .cwd // "")}'
  done | jq -s '.'
)

# Found by terminal, not by the claude.session label: another SessionStart hook sets that label at the same moment.
own=$(jq -c --arg me "$HC_TERMINAL_ID" 'map(select(.address == $me)) | first // empty' <<<"$terminals")
[ -n "$own" ] || exit 0
space=$(jq -r '.space' <<<"$own")
own_role=$(jq -r '.role' <<<"$own")
live=$(jq -c --arg me "$HC_TERMINAL_ID" --arg space "$space" --argjson reg "$registry" 'map(select(.space == $space and .address != $me and $reg[.session] != null))' <<<"$terminals")

# Decided on the first event that finds no role, so a session whose terminal was not labelled yet still gets one.
role="$own_role"
if [ "$event" = SessionStart ] || [ -z "$own_role" ] || [ "$own_role" = coordinator ]; then
  enabled=$(jq -r --arg s "$space" '.spaces[$s].enabled // false' "$settings" 2>/dev/null || echo false)
  role=$(decide_role "$own_role" "$enabled")
  if [ "$role" != "$own_role" ]; then
    labels=("role=$role")
    [ "$role" != child ] || labels+=("coord=${HERDR_COORD:-}")
    hc label "$HC_TERMINAL_ID" "${labels[@]}" >/dev/null 2>&1 || true
  fi
fi

coord_terminal=$(jq -r '.coord' <<<"$own")
[ "$role" != child ] || [ -n "$coord_terminal" ] || coord_terminal="${HERDR_COORD:-}"
# $1 a terminal address. Echoes the session name of the live agent there, or nothing.
name_of() { jq -r --arg t "$1" --argjson reg "$registry" '(map(select(.address == $t)) | first | .session) as $s | if $s == null then empty else $reg[$s].name // empty end' <<<"$live"; }
coord_name=$(name_of "$coord_terminal")
owner_terminal=$(jq -r '.owner' <<<"$own")

# Each listed coordinator is followed by its children, indented; then children of this agent or of an
# absent coordinator; then everyone else.
roster=$(jq -r --argjson reg "$registry" --arg me "$HC_TERMINAL_ID" --argjson max 8 '
  . as $all
  | (map(select(.role == "coordinator") | {key: .address, value: "\($reg[.session].name) [\(.address)]"}) | from_entries) as $coords
  | [(.[] | select(.role == "coordinator") | . as $c | $c, ($all[] | select(.role == "child" and .coord == $c.address))),
     (.[] | select(.role == "child" and $coords[.coord] == null)),
     (.[] | select(.role != "child" and .role != "coordinator"))]
  | .[:$max] | map(
    (if .role == "child" and $coords[.coord] != null then "  " else "" end)
    + "- \($reg[.session].name) [\(.address)] (herdr \(.where // "?")) \($reg[.session].status // "unknown")"
    + (if .role == "coordinator" then " (coordinator)" elif .role == "child" then " (child of \(if .coord == $me then "you" else $coords[.coord] // "terminal \(.coord)" end))" else "" end)
    + ": \(.title[:60]), in \(.folder | split("/") | last)") | join("\n")' <<<"$live")
own_name=$(jq -rn --argjson reg "$registry" --arg me "$session" '$reg[$me].name // empty')
space_name=$(jq -r '(.where // "this space") | split(" / ")[0]' <<<"$own")

context=""
if [ -n "$roster" ] || [ "$role" = coordinator ] || [ "$role" = child ]; then
  context="You are one of several Claude agents sharing the herdr space \"$space_name\". You are ${own_name:-unnamed} (terminal $HC_TERMINAL_ID)."
  [ -z "$roster" ] || context+=$'\n'"Peers right now (status as of when this was written; ListAgents shows it live):"$'\n'"$roster"
  case "$role" in
    child) context+=$'\n'"$(child_protocol "$coord_name" "$coord_terminal" "$(name_of "$owner_terminal")" "$owner_terminal")"$'\n'"$(notes_pointer "$spaces_dir/$space/notes.md")" ;;
    coordinator)
      prefs=""; [ ! -f "$preferences" ] || prefs=$(head -c 3000 "$preferences")
      others=$(jq -r --argjson reg "$registry" 'map(select(.role == "coordinator") | "\($reg[.session].name // "unnamed") [\(.address)]") | join(", ")' <<<"$live")
      coords="$HC_TERMINAL_ID $(jq -r 'map(select(.role == "coordinator") | .address) | join(" ")' <<<"$live")"
      context+=$'\n'"$(coordinator_charter "$prefs" "$others")"
      context+=$'\n'"$(coordinator_record "$spaces_dir/$space" "$space_name" "${own_name:-$HC_TERMINAL_ID}" "$coords")" ;;
    *) context+=$'\n'"$(peer_protocol)"$'\n'"$(notes_pointer "$spaces_dir/$space/notes.md")" ;;
  esac
fi

# What identifies the group, so a prompt only repeats the context when someone joined or left, or a
# child was lent or returned. The role stays the first field: the mode-off check below reads it.
signature="$role|$coord_terminal|$(jq -r 'map(.session + ":" + .role + ":" + .coord) | sort | join(",")' <<<"$live")"
mkdir -p "$state_dir"
previous=$(cat "$state_dir/$session.sig" 2>/dev/null || true)
printf '%s' "$signature" > "$state_dir/$session.sig"

# A coordinator whose mode was switched off is told once that it is an ordinary agent again.
if [ "${previous%%|*}" = coordinator ] && [ "$role" != coordinator ] && [ "$role" != child ]; then
  context="Coordinator mode is now off for this space. You are an ordinary agent again: do not launch or direct child agents."
fi

[ -n "$context" ] || exit 0
[ "$event" = SessionStart ] || [ "$signature" != "$previous" ] || exit 0

jq -n --arg event "$event" --arg text "$context" '{hookSpecificOutput: {hookEventName: $event, additionalContext: $text}}'
