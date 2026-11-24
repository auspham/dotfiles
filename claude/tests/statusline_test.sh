#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo_root/claude/statusline.sh"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT

fail=0
check() {
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (expected '$3', got '$2')"; fail=1; fi
}

run() {
  HOME="$root/home" bash "$script" <<< "$1"
}

limits='{"five_hour":{"used_percentage":12.4},"seven_day":{"used_percentage":50}}'
with_limits='{"model":{"display_name":"Opus"},"session_id":"abc-1","cost":{"total_cost_usd":1.5},"rate_limits":'"$limits"'}'
no_limits='{"model":{"display_name":"Opus"},"session_id":"abc-1","cost":{"total_cost_usd":1.234}}'
unsafe='{"model":{"display_name":"Opus"},"session_id":"../evil","cost":{"total_cost_usd":1}}'
usage="$root/home/.cache/claude/usage.json"
costs="$root/home/.cache/claude/cost"

run "$with_limits" > /dev/null
check "the status line still writes usage.json" "$(jq -c '.rate_limits.five_hour.used_percentage' "$usage")" "12.4"

check "a session's cost is recorded" "$(jq -r '"\(.session) \(.cost) \(.model)"' "$costs/abc-1.json")" "abc-1 1.5 Opus"

run "$unsafe" > /dev/null
check "an unsafe session id is not used as a path" "$(find "$root" -name 'evil*' | wc -l | tr -d ' ')" "0"

first=$(jq -r '.started' "$costs/abc-1.json")
sleep 1
text=$(run "$no_limits")
check "a session keeps its first start time" "$(jq -r '.started' "$costs/abc-1.json")" "$first"
check "a later report moves the last-seen time" "$([ "$(jq -r '.at' "$costs/abc-1.json")" -gt "$first" ] && echo yes)" "yes"

check "the text shows cost when there are no rate limits" "$(printf '%s' "$text" | grep -c 'cost: \$1.23')" "1"
check "the text keeps the limits when they are reported" "$(run "$with_limits" | grep -c '5h: 12% | 7d: 50%')" "1"

exit "$fail"
