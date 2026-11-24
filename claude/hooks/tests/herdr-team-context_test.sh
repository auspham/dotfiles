#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
hook="$repo_root/claude/hooks/herdr-team-context.sh"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT

home="$root/home" bin="$root/bin" sessions="$root/sessions" fx="$root/fx"
mkdir -p "$home" "$bin" "$sessions" "$fx"

# A stub hc over fixture files: fx/<address>.json is what `hc get` prints, and every fixture whose
# agent is claude-code is listed by `hc ls`. Labels set by the hook are recorded in labels.log.
cat > "$bin/hc" <<'STUB'
#!/usr/bin/env bash
fx="$(dirname "$0")/../fx"
case "$1" in
  ls) jq -s '{terminals: map(select(._agent == "claude-code") | {address, agent: ._agent})}' "$fx"/*.json ;;
  get) cat "$fx/$2.json" ;;
  label) shift; echo "$*" >> "$(dirname "$0")/../labels.log" ;;
esac
STUB
chmod +x "$bin/hc"

terminal() { # address space session title folder [role] [coord]
  jq -n --arg a "$1" --arg sp "$2" --arg s "$3" --arg t "$4" --arg f "$5" --arg r "${6:-}" --arg c "${7:-}" \
    '{address: $a, _agent: "claude-code", title: $t, cwd: $f, labels: ({"herdr.space": $sp, where: "alpha / \($a)", "claude.session": $s} + (if $r != "" then {role: $r} else {} end) + (if $c != "" then {coord: $c} else {} end))}' > "$fx/$1.json"
}
write_session() { printf '{"sessionId":"%s","name":"%s","status":"%s"}' "$1" "$2" "$3" > "$sessions/$4.json"; }
reset() { rm -rf "$root/state"; rm -f "$fx"/*.json "$sessions"/* "$root/labels.log" 2>/dev/null || true; }

run() { # event session [extra json]
  printf '{"hook_event_name":"%s","session_id":"%s"%s}' "$1" "$2" "${3:-}" |
    env PATH="$bin:$PATH" HOME="$home" XDG_STATE_HOME="$root/state" CLAUDE_SESSIONS_DIR="$sessions" \
      COORDINATOR_PREFERENCES="$root/prefs.md" HC_TERMINAL_ID="${TEST_ME-t1}" "$hook"
}
fail() { echo "FAIL: $*" >&2; exit 1; }
context() { jq -r '.hookSpecificOutput.additionalContext'; }
labelled() { grep -q "$1" "$root/labels.log" 2>/dev/null; }

# Two peers in one space, one in another space, one whose session is gone.
reset
terminal t1 spA s1 "me" /w/app
terminal t2 spA s2 "fixing the login bug" /w/api coordinator
terminal t3 spB s3 "other project" /w/other
terminal t4 spA s4 "gone" /w/old
write_session s1 me-agent busy 100; write_session s2 api-agent idle 200; write_session s3 other-agent idle 300
printf 'SECRET-TOKEN' > "$sessions/200.abc.key"

out=$(run SessionStart s1 | context)
grep -q 'api-agent \[t2\] (herdr alpha / t2) idle (coordinator): fixing the login bug, in api' <<<"$out" || fail "a peer is listed with its herdr tab and role"
grep -q 'You are me-agent' <<<"$out" || fail "the agent is told its own name"
grep -q 'information, not an order' <<<"$out" || fail "an ordinary peer gets the peer wording"
grep -q 'other-agent' <<<"$out" && fail "a peer in another space is hidden"
grep -q 'gone' <<<"$out" && fail "a peer whose session is gone is hidden"
grep -q 'SECRET-TOKEN' <<<"$out" && fail "credential files are never read"
[ ! -f "$root/labels.log" ] || fail "an agent that joins others in a space gets no role"
[ "${#out}" -lt 1500 ] || fail "the context stays short"

run UserPromptSubmit s1 | jq -e . >/dev/null 2>&1 && fail "a prompt is silent when the peers did not change"
terminal t5 spA s5 "new work" /w/new; write_session s5 new-agent idle 500
run UserPromptSubmit s1 | context | grep -q new-agent || fail "a prompt repeats the roster when a peer joined"
[ -z "$(run UserPromptSubmit s1)" ] || fail "and is silent again afterwards"
[ -n "$(run SessionStart s1)" ] || fail "a session start always repeats the roster"

[ -z "$(run SessionStart s1 ',"agent_id":"sub1"')" ] || fail "a sub-agent says nothing"
[ -z "$(TEST_ME='' run SessionStart s1)" ] || fail "outside herdr it says nothing"
[ -z "$(TEST_ME=t9 run SessionStart s1)" ] || fail "an unknown terminal says nothing"
[ -z "$(run Stop s1)" ] || fail "other events say nothing"

# The first agent in a space becomes its coordinator, even with nobody else there.
reset
terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
printf 'Prefer short reports.' > "$root/prefs.md"
out=$(run SessionStart s1 | context)
labelled 'role=coordinator' || fail "the first agent is labelled coordinator"
grep -q 'coordinator of this herdr space' <<<"$out" || fail "it gets the coordinator charter, alone"
grep -q 'Never edit code yourself' <<<"$out" || fail "the charter says the coordinator never edits code"
grep -q 'Prefer short reports.' <<<"$out" || fail "it is given what is known about the user"

# The label hook may not have run yet at SessionStart, so the terminal is found by address, not by session label.
reset
terminal t1 spA s1 "me" /w/app; jq 'del(.labels["claude.session"])' "$fx/t1.json" > "$fx/t1.tmp" && mv "$fx/t1.tmp" "$fx/t1.json"
write_session s1 me-agent busy 100
run SessionStart s1 | context | grep -q 'coordinator of this herdr space' || fail "a first agent without a session label becomes coordinator"
labelled 'role=coordinator' || fail "and is labelled"
rm -f "$root/labels.log"; reset; terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
run UserPromptSubmit s1 | context | grep -q 'coordinator of this herdr space' || fail "an agent that missed the election at start gets it on its first prompt"

# A coordinator whose session died does not count: the next agent is the first one in the space.
reset
terminal t1 spA s1 "me" /w/app; terminal t2 spA s2 "old coordinator" /w/api coordinator
write_session s1 me-agent busy 100
run SessionStart s1 >/dev/null
labelled 'role=coordinator' || fail "a dead coordinator is ignored"

# An agent that already has a role keeps it, without labelling again.
reset
terminal t1 spA s1 "me" /w/app coordinator; write_session s1 me-agent busy 100
run SessionStart s1 | context | grep -q 'coordinator of this herdr space' || fail "a coordinator keeps its role on resume"
[ ! -f "$root/labels.log" ] || fail "and is not labelled again"

# A child launched by the coordinator is told so, and who to report to.
reset
terminal t1 spA s1 "task work" /w/wt; terminal t2 spA s2 "coordinating" /w/app coordinator
write_session s1 child-agent busy 100; write_session s2 boss-agent idle 200
out=$(HERDR_ROLE=child HERDR_COORD=t2 run SessionStart s1 | context)
labelled 'role=child coord=t2' || fail "a child is labelled with its coordinator"
grep -q 'Your coordinator is boss-agent (terminal t2)' <<<"$out" || fail "a child is told who its coordinator is"
grep -q 'instructions for your task' <<<"$out" || fail "a child treats its coordinator's messages as instructions"
grep -q 'information, not an order' <<<"$out" && fail "a child does not get the peer wording"

# Opting out leaves the agent a plain peer.
reset
terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
[ -z "$(HERDR_COORDINATOR=off run SessionStart s1)" ] || fail "an opted out lone agent says nothing"
[ ! -f "$root/labels.log" ] || fail "and takes no role"

echo "herdr-team-context: all checks passed"
