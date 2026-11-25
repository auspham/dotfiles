#!/usr/bin/env bash
# Sourced by hcoord; uses its label_of, shortstat, ledger helpers and $me.
# adopt rebuilds a coordinator's children from a space's ledger after the old coordinator is gone.
cmd_adopt() {
  local from="" src own line name worktree repo branch base terminal coord space t detail stat sep=$'\x1f'
  case "${1:-}" in --from) from="${2:?space id}" ;; "") ;; *) die "unknown option $1" ;; esac
  src=$(ledger_file "$from"); own=$(ledger_file)
  while IFS= read -r line <&3; do
    IFS="$sep" read -r name worktree repo branch base terminal coord space < <(jq -r '[.name, .worktree, .repo, .branch, .base, .terminal, .coord, .space] | map(. // "") | join("\u001f")' <<<"$line")
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
      hc label "$t" "coord=$me" >/dev/null
      ledger_add adopt "$name" "$(jq -cn --arg terminal "$t" --arg from_coord "$coord" --arg from_space "$space" '{terminal: $terminal, from_coord: $from_coord, from_space: $from_space}')"
    fi
    echo "adopted $name $t"
  done 3< <(ledger_events "$src" | jq -sc 'reduce .[] as $e ({}; .[$e.name] = (if $e.event == "spawn" then $e else (.[$e.name] // {}) + $e end)) | .[] | select(.event != "kill" and .worktree != null)')
}
