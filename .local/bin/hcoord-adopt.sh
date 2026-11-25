#!/usr/bin/env bash
# Sourced by hcoord; uses its label_of, shortstat, ledger helpers and $me.
# The latest of spawn or adopt (its coord) or lend or return (its to) decides who controls a child.
ctl_rule='def ctl($e; $was): if $e.event | IN("spawn", "adopt") then $e.coord elif $e.event | IN("lend", "return") then $e.to else $was end;'
# adopt rebuilds a coordinator's children from a space's ledger after the old coordinator is gone.
cmd_adopt() {
  local from="" src own live="" line name worktree repo branch base terminal coord space t detail stat sep=$'\x1f'
  case "${1:-}" in --from) from="${2:?space id}" ;; "") ;; *) die "unknown option $1" ;; esac
  src=$(ledger_file "$from"); own=$(ledger_file)
  [ -n "$from" ] || live=$(hc ls --json --label role=coordinator --label "herdr.space=$(label_of "$me" herdr.space)" | jq -r '.terminals[].address')
  while IFS= read -r line <&3; do
    IFS="$sep" read -r name worktree repo branch base terminal coord space < <(jq -r '[.name, .worktree, .repo, .branch, .base, .terminal, .ctl, .space] | map(. // "") | join("\u001f")' <<<"$line")
    if [ -n "$coord" ] && [ "$coord" != "$me" ] && grep -qxF "$coord" <<<"$live"; then echo "skipped $name (controlled by $coord)"; continue; fi
    if [ "$src" != "$own" ] && [ -z "$(ledger_events "$own" | jq -c --arg n "$name" 'select(.name == $n)')" ]; then
      mkdir -p "$(dirname "$own")"; ledger_events "$src" | jq -c --arg n "$name" 'select(.name == $n)' >> "$own"
    fi
    t=$(hc ls --json --label "task=$name" --label "worktree=$worktree" </dev/null | jq -r '.terminals[0].address // empty')
    if [ -z "$t" ]; then
      if git -C "$repo" worktree list --porcelain 2>/dev/null | grep -qxF "worktree $worktree"; then
        stat=$(shortstat "$worktree" "$base"); detail="branch $branch, ${stat:-no changes}"
      else detail="branch $branch, worktree missing"; fi
      echo "orphaned $name $worktree ($detail)"
      continue
    fi
    if [ "$(label_of "$t" coord)" != "$me" ]; then
      hc label "$t" "coord=$me" "owner=" >/dev/null
      ledger_add adopt "$name" "$(jq -cn --arg terminal "$t" --arg from_coord "$coord" --arg from_space "$space" '{terminal: $terminal, from_coord: $from_coord, from_space: $from_space}')"
    fi
    echo "adopted $name $t"
  done 3< <(ledger_events "$src" | jq -sc "$ctl_rule"'reduce .[] as $e ({}; .[$e.name] = (if $e.event == "spawn" then $e else (.[$e.name] // {}) + $e end) + {ctl: ctl($e; .[$e.name].ctl)}) | .[] | select(.event != "kill" and .worktree != null)')
}
