#!/usr/bin/env bash
# Sourced by hcoord; uses its child_of, find_child, label_of, ledger_add and $me.
# A loan moves a child to another coordinator in the space until either side returns it.
cmd_lend() {
  local name="${1:?name}" to t
  [ "${2:-}" = --to ] && [ -n "${3:-}" ] || die "usage: hcoord lend <name> --to <terminal>"
  to="$3"; t=$(child_of "$name")
  [ -z "$(label_of "$t" owner)" ] || die "$name is on loan from $(label_of "$t" owner); return it instead"
  [ "$to" != "$me" ] || die "$name is already yours"
  hc ls --json --label role=coordinator --label "herdr.space=$(label_of "$me" herdr.space)" | jq -e --arg t "$to" 'any(.terminals[]; .address == $t)' >/dev/null \
    || die "$to is not a coordinator in this space"
  hc label "$t" "coord=$to" "owner=$me" >/dev/null
  ledger_add lend "$name" "$(jq -cn --arg to "$to" --arg from "$me" '{to: $to, from: $from}')"
}

# Either side of a loan may end it: the borrower hands the child back, or the owner takes it back.
cmd_return() {
  local name="${1:?name}" t coord owner
  t=$(find_child "$name"); coord=$(label_of "$t" coord); owner=$(label_of "$t" owner)
  [ -n "$owner" ] || die "$name is not lent"
  [ "$coord" = "$me" ] || [ "$owner" = "$me" ] || die "$name belongs to coordinator $coord; ask it over SendMessage"
  hc label "$t" "coord=$owner" "owner=" >/dev/null
  ledger_add return "$name" "$(jq -cn --arg to "$owner" --arg from "$coord" '{to: $to, from: $from}')"
}
