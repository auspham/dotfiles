#!/usr/bin/env bash
# Claude Code status line: also records rate limits and per-session cost for the herdr claude-usage mod.
input=$(cat)
cache="$HOME/.cache/claude"
costdir="$cache/cost"

write_usage() {
  mkdir -p "$cache" || return
  echo "$input" | jq -c '{rate_limits, at: now}' > "$cache/usage.json.tmp" && mv "$cache/usage.json.tmp" "$cache/usage.json"
  if echo "$input" | jq -e '.rate_limits | type == "object"' > /dev/null 2>&1; then
    cp "$cache/usage.json" "$cache/limits.json.tmp" && mv "$cache/limits.json.tmp" "$cache/limits.json"
  fi
}
write_usage 2>/dev/null

model=$(echo "$input" | jq -r '.model.display_name')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
five=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
week=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
effort=$(echo "$input" | jq -r '.effort.level // empty')
size=$(echo "$input" | jq -r '.context_window.context_window_size // empty')
cost=$(echo "$input" | jq -r '.cost.total_cost_usd // empty')
session=$(echo "$input" | jq -r '.session_id // empty')

record_cost() {
  case "$session" in '' | *[!A-Za-z0-9-]*) return ;; esac
  local file="$costdir/$session.json" started limits
  mkdir -p "$costdir" || return
  limits=$(echo "$input" | jq '.rate_limits | type == "object"')
  started=$(jq -r '.started // empty' "$file" 2>/dev/null)
  jq -nc --arg session "$session" --arg model "$model" --argjson cost "$cost" --arg started "$started" --argjson limits "$limits" \
    '(now | floor) as $at | {session: $session, cost: $cost, model: $model, limits: $limits, at: $at, started: (if $started == "" then $at else ($started | tonumber) end)}' \
    > "$file.tmp" && mv "$file.tmp" "$file"
}

prune_costs() {
  local stamp="$costdir/.pruned"
  [ -n "$(find "$stamp" -mtime -1 2>/dev/null)" ] && return
  find "$costdir" -name '*.json' -mtime +45 -delete 2>/dev/null
  touch "$stamp"
}

if [ -n "$cost" ]; then
  { record_cost && prune_costs; } 2>/dev/null
fi

pct() { [ -n "$1" ] && printf '%.0f%%' "$1" || printf -- '-'; }
if [ -z "$size" ]; then sz=''; elif [ "$size" -ge 1000000 ]; then sz=" of $((size / 1000000))M"; else sz=" of $((size / 1000))k"; fi
out=$(printf '\033[01;36m%s\033[00m' "$model")
[ -n "$effort" ] && out="$out | effort: $effort"
out="$out | ctx: $(pct "$used")$sz"
if [ -z "$five" ] && [ -z "$week" ] && [ -n "$cost" ]; then
  out="$out | cost: $(printf '$%.2f' "$cost")"
else
  out="$out | 5h: $(pct "$five") | 7d: $(pct "$week")"
fi
echo "$out"
