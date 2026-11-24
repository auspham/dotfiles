#!/usr/bin/env bash
# Sourced by hcoord; uses its label_of and $me.
# The ledger is the durable record of this space's children; labels die with their terminals.
ledger_file() { echo "${COORDINATOR_HOME:-$HOME/.claude/coordinator}/spaces/${1:-$(label_of "$me" herdr.space)}/ledger.jsonl"; }
ledger_add() {
  local file; file=$(ledger_file); mkdir -p "$(dirname "$file")"
  jq -cn --arg event "$1" --arg name "$2" --arg coord "$me" --arg space "$(label_of "$me" herdr.space)" --arg where "$(label_of "$me" where)" --argjson extra "$3" \
    '{at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")), event: $event, name: $name, coord: $coord, space: $space, space_name: ($where | split(" / ")[0])} + $extra' >> "$file"
}
# Valid event objects of a ledger, one per line; a damaged line is skipped.
ledger_events() {
  local line; [ -f "$1" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    jq -c 'select(type == "object" and (.name | type) == "string")' <<<"$line" 2>/dev/null || true
  done < "$1"
}
