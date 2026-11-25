#!/usr/bin/env bash
set -euo pipefail

hook="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/herdr-turn-source.sh"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/bin"

cat > "$root/bin/hc" <<'STUB'
#!/usr/bin/env bash
[ "$1" = label ] && { shift; echo "$*" >> "${TEST_LOG}"; }
STUB
chmod +x "$root/bin/hc"

run() { jq -cn --arg p "$1" "{prompt: \$p}${2:-}" | env PATH="$root/bin:$PATH" TEST_LOG="$root/log" HC_TERMINAL_ID=t1 "$hook"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

run "fix the bug"
grep -qx 't1 turn=user' "$root/log" || fail "a prompt the user typed marks the turn as the user's"

rm -f "$root/log"
run '<cross-session-message from="child">done</cross-session-message>'
grep -qx 't1 turn=peer' "$root/log" || fail "a message from another session marks the turn as a peer's"

rm -f "$root/log"
run "fix the bug" ' + {agent_id: "a1"}'
[ ! -f "$root/log" ] || fail "a subagent's prompt leaves the label alone"

echo "herdr-turn-source: all checks passed"
