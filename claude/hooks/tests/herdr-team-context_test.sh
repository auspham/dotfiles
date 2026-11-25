#!/usr/bin/env bash
set -euo pipefail
unset HERDR_ROLE HERDR_COORD HERDR_COORDINATOR

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

terminal() { # address space session title folder [role] [coord] [owner]
  jq -n --arg a "$1" --arg sp "$2" --arg s "$3" --arg t "$4" --arg f "$5" --arg r "${6:-}" --arg c "${7:-}" --arg o "${8:-}" \
    '{address: $a, _agent: "claude-code", title: $t, cwd: $f, labels: ({"herdr.space": $sp, where: "alpha / \($a)", "claude.session": $s} + (if $r != "" then {role: $r} else {} end) + (if $c != "" then {coord: $c} else {} end) + (if $o != "" then {owner: $o} else {} end))}' > "$fx/$1.json"
}
write_session() { printf '{"sessionId":"%s","name":"%s","status":"%s"}' "$1" "$2" "$3" > "$sessions/$4.json"; }
enable() { printf '{"spaces":{"%s":{"enabled":true}}}' "$1" > "$root/settings.json"; }
reset() { rm -rf "$root/state" "$root/settings.json" "$root/coord"; rm -f "$fx"/*.json "$sessions"/* "$root/labels.log" 2>/dev/null || true; }

run() { # event session [extra json]
  printf '{"hook_event_name":"%s","session_id":"%s"%s}' "$1" "$2" "${3:-}" |
    env PATH="$bin:$PATH" HOME="$home" XDG_STATE_HOME="$root/state" CLAUDE_SESSIONS_DIR="$sessions" \
      COORDINATOR_PREFERENCES="$root/prefs.md" COORDINATOR_HOME="$root/coord" HERDR_TEAM_SETTINGS="$root/settings.json" HC_TERMINAL_ID="${TEST_ME-t1}" "$hook"
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
[ ! -f "$root/labels.log" ] || fail "an agent in a space with the mode off gets no role"
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

# With the mode switched on, an agent alone in a space becomes a coordinator.
reset; enable spA
terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
printf 'Prefer short reports.' > "$root/prefs.md"
out=$(run SessionStart s1 | context)
labelled 'role=coordinator' || fail "a lone agent is labelled coordinator"
grep -q 'coordinator of this herdr space' <<<"$out" || fail "it gets the coordinator charter, alone"
grep -q 'Never edit code yourself' <<<"$out" || fail "the charter says the coordinator never edits code"
grep -q 'Prefer short reports.' <<<"$out" || fail "it is given what is known about the user"

# The label hook may not have run yet at SessionStart, so the terminal is found by address, not by session label.
reset; enable spA
terminal t1 spA s1 "me" /w/app; jq 'del(.labels["claude.session"])' "$fx/t1.json" > "$fx/t1.tmp" && mv "$fx/t1.tmp" "$fx/t1.json"
write_session s1 me-agent busy 100
run SessionStart s1 | context | grep -q 'coordinator of this herdr space' || fail "an agent without a session label becomes coordinator"
labelled 'role=coordinator' || fail "and is labelled"
grep -q 'No other coordinator is here right now' <<<"$(run SessionStart s1 | context)" || fail "a lone coordinator is told no other coordinator is here"
rm -f "$root/labels.log"; reset; enable spA; terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
run UserPromptSubmit s1 | context | grep -q 'coordinator of this herdr space' || fail "an agent that missed the election at start gets it on its first prompt"

# Every agent the user starts in a space with the mode on is a coordinator, even beside a live one.
reset; enable spA
terminal t1 spA s1 "me" /w/app; terminal t2 spA s2 "other coordinator" /w/api coordinator
write_session s1 me-agent busy 100; write_session s2 other-agent idle 200
run SessionStart s1 | context | grep -q 'coordinator of this herdr space' || fail "a second agent in the space gets the coordinator charter"
labelled 'role=coordinator' || fail "a second agent beside a live coordinator is labelled coordinator too"
out=$(run SessionStart s1 | context)
grep -q 'Other coordinators here: other-agent \[t2\]\.' <<<"$out" || fail "a coordinator is told the other live coordinators by name and terminal"
grep -q 'first agent' <<<"$out" && fail "a coordinator is not called the first agent"
grep -q 'hcoord ls --all, hcoord diff, hc read' <<<"$out" || fail "a coordinator is told it may read any child"
grep -q "ask that coordinator with SendMessage first" <<<"$out" || fail "a coordinator asks before changing another coordinator's child"
grep -q 'hcoord lend <name> --to <terminal>' <<<"$out" || fail "a coordinator is told how to lend a child after agreeing"
grep -q 'coordinators/me-agent.md' <<<"$out" || fail "a coordinator keeps its plan in a file named after its session"
grep -q 'own Workstreams line' <<<"$out" || fail "a coordinator keeps only its own Workstreams line in the shared notes"

# An agent that already has a role keeps it, without labelling again.
reset; enable spA
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

# The coordinator's knowledge space: notes, unadopted children, a recreated space, damaged lines.
reset; enable spA
terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
out=$(run SessionStart s1 | context)
grep -q "$root/coord/spaces/spA" <<<"$out" || fail "a coordinator is told where its knowledge dir is"
grep -q 'hcoord adopt' <<<"$out" && fail "a coordinator with no record is not told to adopt"
write_session s1 "" busy 100; jq '.name = null' "$sessions/100.json" > "$sessions/100.tmp" && mv "$sessions/100.tmp" "$sessions/100.json"
run SessionStart s1 | context | grep -q 'coordinators/t1.md' || fail "an unnamed coordinator's plan file is named after its terminal"
write_session s1 me-agent busy 100
mkdir -p "$root/coord/spaces/spA"; printf 'Goal: ship the thing' > "$root/coord/spaces/spA/notes.md"
run SessionStart s1 | context | grep -q 'Goal: ship the thing' || fail "a coordinator is shown its notes"
cat > "$root/coord/spaces/spA/ledger.jsonl" <<'LEDGER'
{"at":"1","event":"spawn","name":"alpha-child","coord":"t1","space":"spA","space_name":"alpha"}
this line is damaged {
{"at":"2","event":"spawn","name":"done-child","coord":"t1","space":"spA","space_name":"alpha"}
{"at":"3","event":"kill","name":"done-child","coord":"t1","space":"spA","space_name":"alpha"}
{"at":"4","event":"spawn","name":"their-child","coord":"t2","space":"spA","space_name":"alpha"}
{"at":"5","event":"spawn","name":"lent-in","coord":"t2","space":"spA","space_name":"alpha"}
{"at":"6","event":"lend","name":"lent-in","coord":"t2","to":"t1","from":"t2","space":"spA","space_name":"alpha"}
{"at":"7","event":"spawn","name":"lent-out","coord":"t1","space":"spA","space_name":"alpha"}
{"at":"8","event":"lend","name":"lent-out","coord":"t1","to":"t2","from":"t1","space":"spA","space_name":"alpha"}
{"at":"9","event":"spawn","name":"came-back","coord":"t1","space":"spA","space_name":"alpha"}
{"at":"10","event":"lend","name":"came-back","coord":"t1","to":"t2","from":"t1","space":"spA","space_name":"alpha"}
{"at":"11","event":"return","name":"came-back","coord":"t2","to":"t1","from":"t2","space":"spA","space_name":"alpha"}
{"at":"12","event":"spawn","name":"readopted","coord":"t2","space":"spA","space_name":"alpha"}
{"at":"13","event":"lend","name":"readopted","coord":"t2","to":"t3","from":"t2","space":"spA","space_name":"alpha"}
{"at":"14","event":"adopt","name":"readopted","coord":"t1","space":"spA","space_name":"alpha"}
{"at":"15","event":"spawn","name":"orphan-child","coord":"t9","space":"spA","space_name":"alpha"}
LEDGER
terminal t2 spA s2 "sibling" /w/app coordinator; write_session s2 sibling-agent idle 200
out=$(run SessionStart s1 | context)
grep -q 'alpha-child' <<<"$out" || fail "a coordinator is told about its unadopted children in the ledger"
grep -q 'hcoord ls, then hcoord adopt' <<<"$out" || fail "and told to list then adopt them"
grep -q 'done-child' <<<"$out" && fail "killed children are not listed"
grep -q 'their-child' <<<"$out" && fail "another coordinator's children are not listed"
grep -q 'lent-in' <<<"$out" || fail "a child lent to the reader is listed"
grep -q 'lent-out' <<<"$out" && fail "a child the reader lent out is not listed"
grep -q 'came-back' <<<"$out" || fail "a child returned to the reader is listed"
grep -q 'readopted' <<<"$out" || fail "an adopt after a lend makes the adopter the controller"
grep -q 'Children whose coordinator is gone: orphan-child\. hcoord adopt takes them' <<<"$out" || fail "a child of a dead coordinator is named as one to adopt"
grep -q 'your children not killed:.*orphan-child' <<<"$out" && fail "a child of a dead coordinator is not called the reader's"
rm "$fx/t2.json"
grep -q 'coordinator is gone: lent-out, orphan-child, their-child\.' <<<"$(run SessionStart s1 | context)" || fail "a coordinator back on a new terminal is told the old children to adopt"

reset; enable spB
terminal t1 spB s1 "me" /w/app; write_session s1 me-agent busy 100
mkdir -p "$root/coord/spaces/spA"
printf '{"at":"1","event":"spawn","name":"c1","space":"spA","space_name":"alpha"}\n' > "$root/coord/spaces/spA/ledger.jsonl"
run SessionStart s1 | context | grep -q 'hcoord adopt --from spA' || fail "a coordinator in a recreated space is pointed at the old space's ledger"
mkdir -p "$root/coord/spaces/spC"
printf '{"at":"1","event":"spawn","name":"c2","space":"spC","space_name":"gamma"}\n' > "$root/coord/spaces/spC/ledger.jsonl"
rm -rf "$root/coord/spaces/spA"
run SessionStart s1 | context | grep -q 'adopt --from' && fail "a ledger of a differently named space is not suggested"

# An adopted child names its new coordinator from the label, not the environment of its first start.
reset
terminal t1 spA s1 "task work" /w/wt child t3; terminal t2 spA s2 "old" /w/app coordinator; terminal t3 spA s3 "new" /w/app coordinator
write_session s1 child-agent busy 100; write_session s2 old-agent idle 200; write_session s3 new-agent idle 300
out=$(HERDR_ROLE=child HERDR_COORD=t2 run SessionStart s1 | context)
grep -q 'Your coordinator is new-agent (terminal t3)' <<<"$out" || fail "an adopted child names its new coordinator from the label"

# A child is told its coordinator even when it sees no peers.
reset
terminal t1 spA s1 "task work" /w/wt child t2; write_session s1 child-agent busy 100
out=$(HERDR_ROLE=child run SessionStart s1 | context)
grep -q 'Your coordinator is unknown (terminal t2)' <<<"$out" || fail "a child with no visible peers is still told who its coordinator is"

# A lent child is re-told its coordinator, and who it goes back to, when the lend or return happens.
reset
terminal t1 spA s1 "task work" /w/wt child t2; terminal t2 spA s2 "owner" /w/app coordinator; terminal t3 spA s3 "borrower" /w/app coordinator
write_session s1 child-agent busy 100; write_session s2 owner-agent idle 200; write_session s3 borrower-agent idle 300
run SessionStart s1 | context | grep -q 'on loan' && fail "a child that is not lent is not told it is on loan"
terminal t1 spA s1 "task work" /w/wt child t3 t2
out=$(run UserPromptSubmit s1 | context)
grep -q 'Your coordinator is borrower-agent (terminal t3)' <<<"$out" || fail "a lent child is re-told its coordinator on its next prompt"
grep -q 'on loan from owner-agent (terminal t2) and go back to it when borrower-agent runs hcoord return' <<<"$out" || fail "a lent child is told who lent it and how it goes back"
[ -z "$(run UserPromptSubmit s1)" ] || fail "a lent child is told only once"
terminal t1 spA s1 "task work" /w/wt child t2
out=$(run UserPromptSubmit s1 | context)
grep -q 'Your coordinator is owner-agent (terminal t2)' <<<"$out" || fail "a returned child is re-told its coordinator"
grep -q 'on loan' <<<"$out" && fail "a returned child is no longer told it is on loan"

# The roster groups each child under the coordinator that controls it.
reset; enable spA
terminal t1 spA s1 "me" /w/app coordinator; terminal t2 spA s2 "a child" /w/wt child t3; terminal t3 spA s3 "boss" /w/app coordinator
terminal t4 spA s4 "my child" /w/wt child t1; terminal t5 spA s5 "lent child" /w/wt child t1 t3; terminal t6 spA s6 "orphan" /w/wt child t9
write_session s1 me-agent busy 100; write_session s2 kid-agent idle 200; write_session s3 boss-agent idle 300
write_session s4 mine-agent idle 400; write_session s5 lent-agent idle 500; write_session s6 orphan-agent idle 600
out=$(run SessionStart s1 | context)
grep -A1 'boss-agent \[t3\].*(coordinator)' <<<"$out" | grep -q '^  - kid-agent \[t2\].*(child of boss-agent \[t3\])' || fail "a child is listed under its coordinator and names it"
grep -q '^- mine-agent \[t4\].*(child of you)' <<<"$out" || fail "the reader's own children are marked as its own"
grep -q '^- lent-agent \[t5\].*(child of you)' <<<"$out" || fail "a child lent to the reader is listed as the reader's"
grep -q '^- orphan-agent \[t6\].*(child of terminal t9)' <<<"$out" || fail "a child of an absent coordinator names its terminal"
terminal t4 spA s4 "my child" /w/wt child t3 t1
run UserPromptSubmit s1 | context | grep -q '^  - mine-agent \[t4\].*(child of boss-agent \[t3\])' || fail "a coordinator's roster is repeated when one of the children is lent"

# A damaged session file is skipped, not fatal.
reset
terminal t1 spA s1 "me" /w/app; terminal t2 spA s2 "fixing the login bug" /w/api coordinator
write_session s1 me-agent busy 100; write_session s2 api-agent idle 200; printf '{"sessionId":"s9","na' > "$sessions/900.json"
run SessionStart s1 | context | grep -q 'api-agent' || fail "one damaged session file does not hide the other agents"

# Other agents in the space are pointed at the coordinator's notes.
reset
terminal t1 spA s1 "me" /w/app; terminal t2 spA s2 "fixing the login bug" /w/api coordinator
write_session s1 me-agent busy 100; write_session s2 api-agent idle 200
run SessionStart s1 | context | grep -q 'notes on the goal' && fail "no pointer when the space has no notes"
mkdir -p "$root/coord/spaces/spA"; printf 'Goal: ship the thing' > "$root/coord/spaces/spA/notes.md"
out=$(run SessionStart s1 | context)
grep -q "at $root/coord/spaces/spA/notes.md" <<<"$out" || fail "a peer is pointed at the space's notes"
grep -q 'Goal: ship the thing' <<<"$out" && fail "a peer is not given the notes themselves"
out=$(HERDR_ROLE=child HERDR_COORD=t2 run SessionStart s1 | context)
grep -q "at $root/coord/spaces/spA/notes.md" <<<"$out" || fail "a child is pointed at the space's notes"

# Opting out leaves the agent a plain peer.
reset; enable spA
terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
[ -z "$(HERDR_COORDINATOR=off run SessionStart s1)" ] || fail "an opted out lone agent says nothing"
[ ! -f "$root/labels.log" ] || fail "and takes no role"

# Coordinator mode is off until the user switches it on for the space.
reset
terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
[ -z "$(run SessionStart s1)" ] || fail "a lone agent says nothing while the mode is off"
[ ! -f "$root/labels.log" ] || fail "and takes no role"
enable spB
[ -z "$(run UserPromptSubmit s1)" ] || fail "the mode is per space: another space being on changes nothing"

# Switching the mode off tells the coordinator, once, and drops its role.
reset; enable spA
terminal t1 spA s1 "me" /w/app; write_session s1 me-agent busy 100
run SessionStart s1 >/dev/null
rm -f "$root/settings.json" "$root/labels.log"
out=$(run UserPromptSubmit s1 | context)
grep -q 'Coordinator mode is now off' <<<"$out" || fail "a coordinator is told when the mode goes off"
[ -z "$(run UserPromptSubmit s1)" ] || fail "and only once"

echo "herdr-team-context: all checks passed"
