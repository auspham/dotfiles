#!/usr/bin/env bash
set -euo pipefail

hcoord="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hcoord"
root="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$root"' EXIT
bin="$root/bin" fx="$root/fx" repo="$root/repo"
mkdir -p "$bin" "$fx"

# Stubs for hc and herdr-app over fixture files: fx/<address>.json is a terminal.
cat > "$bin/hc" <<'STUB'
#!/usr/bin/env bash
fx="$(dirname "$0")/../fx"; log="$(dirname "$0")/../calls.log"
case "$1" in
  get) cat "$fx/$2.json" ;;
  ls)
    shift; filter='true'
    while [ $# -gt 0 ]; do
      if [ "$1" = --label ]; then k="${2%%=*}"; v="${2#*=}"; filter="$filter and (.labels[\"$k\"] == \"$v\")"; shift; fi
      shift
    done
    jq -s "{terminals: map(select($filter))}" "$fx"/*.json 2>/dev/null || echo '{"terminals":[]}' ;;
  label)
    t="$2"; shift 2
    for kv in "$@"; do
      k="${kv%%=*}"; v="${kv#*=}"
      jq --arg k "$k" --arg v "$v" 'if $v == "" then del(.labels[$k]) else .labels[$k] = $v end' "$fx/$t.json" > "$fx/$t.tmp" && mv "$fx/$t.tmp" "$fx/$t.json"
    done ;;
  kill | rm) echo "hc $*" >> "$log"; [ "$1" != rm ] || rm -f "$fx/$2.json" ;;
esac
STUB
cat > "$bin/herdr-app" <<'STUB'
#!/usr/bin/env bash
fx="$(dirname "$0")/../fx"; log="$(dirname "$0")/../calls.log"
echo "herdr-app $*" >> "$log"
case "$2" in
  tab.new)
    n=$(( $(ls "$fx" | wc -l) + 8 )); space=$(sed -n 's/.*--space \([^ ]*\).*/\1/p' <<<"$*")
    printf '{"address":"t%s","status":{"state":"working"},"labels":{"herdr.tab":"tb%s","herdr.space":"%s"}}' "$n" "$n" "$space" > "$fx/t$n.json"
    printf '{"space":"sp1","tab":"tb%s","terminal":"t%s"}' "$n" "$n" ;;
esac
STUB
chmod +x "$bin/hc" "$bin/herdr-app"

git init -q -b main "$repo"
git -C "$repo" -c user.email=a@b -c user.name=t commit -q --allow-empty -m init
echo one > "$repo/a.txt"; git -C "$repo" add a.txt; git -C "$repo" -c user.email=a@b -c user.name=t commit -q -m "add a"

printf '{"address":"t1","labels":{"herdr.space":"spA"}}' > "$fx/t1.json"
export COORDINATOR_HOME="$root/coord"
ledger="$COORDINATOR_HOME/spaces/spA/ledger.jsonl"
event() { jq -Rc --arg e "$1" --arg n "$2" 'fromjson? | select(.event == $e and .name == $n)' "${3:-$ledger}" | tail -n 1; }
run() { (cd "$repo" && env PATH="$bin:$PATH" HC_TERMINAL_ID="${TEST_ME-t1}" "$hcoord" "$@"); }
fail() { echo "FAIL: $*" >&2; exit 1; }
calls() { cat "$root/calls.log" 2>/dev/null || true; }
dump() { calls >&2; }

out=$(run spawn login-fix "Fix the login test" --model haiku)
terminal=$(jq -r .terminal <<<"$out")
[ -d "$repo/.agent-worktrees/login-fix" ] || fail "the child gets its own worktree"
[ "$(git -C "$repo/.agent-worktrees/login-fix" branch --show-current)" = agent/login-fix ] || fail "on its own branch"
grep -qxF '.agent-worktrees/' "$repo/.git/info/exclude" || fail "worktrees stay out of git status"
[ -z "$(git -C "$repo" status --short)" ] || fail "the repo stays clean"
calls | grep -q 'tab.new --name login-fix --space spA --folder '"$repo"'/.agent-worktrees/login-fix' || fail "the child opens in its own tab, in its worktree"
calls | grep -q 'HERDR_ROLE=child' && calls | grep -q 'HERDR_COORD=t1' || { dump; fail "it is launched as a child of the coordinator"; }
calls | grep -q '"--model","haiku"' || fail "the model option is passed on"
calls | grep -q -- '--space spA' || fail "the child opens in the coordinator's own space"
calls | grep -q -- '--focus false' || fail "the new tab does not steal focus"
calls | grep -q 'Fix the login test' || fail "the task is its first message"
[ "$(jq -r '.labels.role + .labels.coord + .labels.task + .labels.review' "$fx/$terminal.json")" = "childt1login-fixpending" ] || fail "its labels say what it is"
[ "$(event spawn login-fix | jq -r '.task + "|" + .coord + "|" + .space + "|" + .terminal + "|" + .base + "|" + .model')" = "Fix the login test|t1|spA|$terminal|main|haiku" ] || fail "spawn records the full task and where the child runs"
[ "$(event spawn login-fix | jq -r .worktree)" = "$repo/.agent-worktrees/login-fix" ] || fail "spawn records the worktree"

run spawn login-fix "again" 2>/dev/null && fail "a name cannot be used twice"
run spawn "Bad Name" "x" 2>/dev/null && fail "names are checked"
run spawn other "" 2>/dev/null && fail "a task is required"
(cd "$root" && env PATH="$bin:$PATH" HC_TERMINAL_ID=t1 "$hcoord" spawn x "task" 2>/dev/null) && fail "it only works inside a repository"
(TEST_ME='' run spawn y "task" 2>/dev/null) && fail "it only works from a herdr terminal"

echo two > "$repo/.agent-worktrees/login-fix/b.txt"
git -C "$repo/.agent-worktrees/login-fix" add b.txt
ls_out=$(run ls); grep -q 'login-fix .*working .*pending .*1 file changed' <<<"$ls_out" || fail "ls shows status, review and the size of the diff"
[ "$(run ls --json | jq -r '.[0].name')" = login-fix ] || fail "ls can give JSON"
diff_out=$(run diff login-fix); grep -q '^+two' <<<"$diff_out" || fail "diff shows the child's changes"
stat_out=$(run diff login-fix --stat); grep -q 'b.txt' <<<"$stat_out" || fail "diff can show just the stat"

run spawn forked "Forked task" >/dev/null
echo sibling > "$repo/sibling.txt"; git -C "$repo" add sibling.txt; git -C "$repo" -c user.email=a@b -c user.name=t commit -q -m "sibling merged"
echo mine > "$repo/.agent-worktrees/forked/mine.txt"; git -C "$repo/.agent-worktrees/forked" add mine.txt
merged_diff=$(run diff forked)
grep -q '^+mine' <<<"$merged_diff" || fail "diff ignores work merged into the base after the child forked: own work is missing"
grep -q 'sibling' <<<"$merged_diff" && fail "diff ignores work merged into the base after the child forked"
run ls | grep -q 'forked .*1 file changed' || fail "diff ignores work merged into the base after the child forked: ls counts only the child's work"
run kill forked --worktree --force >/dev/null; : > "$root/calls.log"

run review login-fix changes "too big" && [ "$(jq -r '.labels.review' "$fx/$terminal.json")" = changes ] || fail "review sets the label"
[ "$(jq -r '.labels.review_note' "$fx/$terminal.json")" = "too big" ] || fail "with its note"
long=$(printf 'n%.0s' $(seq 1 300))
run review login-fix pending "$long"
[ "$(event review login-fix | jq -r '.note | length')" = 300 ] || fail "review keeps a note longer than 200 characters"
[ "$(event review login-fix | jq -r .verdict)" = pending ] || fail "review records the verdict"
run review login-fix reviewing 2>/dev/null || fail "review works without a note"
[ "$(jq -r '.labels.review' "$fx/$terminal.json")" = reviewing ] && [ "$(event review login-fix | jq -r .verdict)" = reviewing ] || fail "review accepts reviewing while the coordinator looks"
run review login-fix maybe 2>/dev/null && fail "review states are checked"

run kill login-fix --worktree 2>/dev/null && fail "a worktree with changes is not removed"
calls | grep -q 'hc kill' && fail "and the agent is left running when that happens"
run kill login-fix --worktree --force >/dev/null
calls | grep -q "hc kill $terminal" || fail "kill stops the agent"
calls | grep -q 'tab.close --id tb' || fail "and closes its tab"
[ ! -d "$repo/.agent-worktrees/login-fix" ] || fail "a forced kill removes the worktree"
[ "$(event kill login-fix | jq -r .worktree_removed)" = true ] || fail "kill records that the worktree was removed"
git -C "$repo" rev-parse --verify -q agent/login-fix >/dev/null || fail "but the branch stays"

run spawn clean-one "Another task" >/dev/null
run kill clean-one --worktree >/dev/null
[ ! -d "$repo/.agent-worktrees/clean-one" ] || fail "a clean worktree is removed without force"

# Handing a reviewed child to the user.
run spawn shipped "Ship it" >/dev/null
ship_t=$(event spawn shipped | jq -r .terminal); ship="$repo/.agent-worktrees/shipped"
tab=$'\t'
git -C "$ship" -c user.email=a@b -c user.name=t commit -q --allow-empty -m empty
echo more >> "$ship/a.txt"; printf 'x\n' > "$ship/new.txt"; printf '\0\1' > "$ship/bin.dat"; git -C "$ship" add -A
git -C "$ship" -c user.email=a@b -c user.name=t commit -q -m "work"
echo sibling2 > "$repo/sibling2.txt"; git -C "$repo" add sibling2.txt; git -C "$repo" -c user.email=a@b -c user.name=t commit -q -m "sibling again"
echo scratch > "$ship/scratch.txt"
printf 'high%sa.txt%sbehaviour change\n' "$tab" "$tab" | run handoff shipped 2>/dev/null && fail "handoff refuses uncommitted work"
rm "$ship/scratch.txt"
printf 'high%sa.txt%sbehaviour change\n' "$tab" "$tab" | run handoff shipped --summary "all done" || fail "handoff runs on committed work"
guide=$(jq -r .labels.guide "$fx/$ship_t.json")
[ "$(jq -r '.files | map(.path + "=" + .sig) | sort | join(" ")' "$guide")" = "a.txt=M:1:0 bin.dat=A:0:0 new.txt=A:1:0" ] || { jq . "$guide" >&2; fail "handoff writes a guide the Changes tab can match"; }
[ "$(jq -r '.files[] | select(.path == "bin.dat") | .sig' "$guide")" = A:0:0 ] || fail "a binary file's sig matches the Changes tab"
[ "$(jq -r '.base' "$guide")" = "$(git -C "$ship" merge-base HEAD main)" ] && [ "$(jq -r '.head' "$guide")" = "$(git -C "$ship" rev-parse HEAD)" ] || fail "the guide names the fork point and the head"
[ "$(jq -r '.files[] | select(.path == "a.txt") | .level + .reason' "$guide")" = "highbehaviour change" ] || fail "the guide keeps the coordinator's level and reason"
[ "$(jq -r '.files[] | select(.path == "new.txt") | .level + "|" + .reason' "$guide")" = "normal|not in the coordinator's guide" ] || fail "a file left out of the guide is normal"
[ "$(jq -r '.summary + .name + .branch' "$guide")" = "all doneshippedagent/shipped" ] || fail "the guide carries the summary and the branch"
[ "$(jq -r '.labels.review' "$fx/$ship_t.json")" = yours ] || fail "handoff marks the child as the user's turn"
[ "$(event handoff shipped | jq -r .guide)" = "$guide" ] || fail "handoff is recorded in the ledger"
before=$(cat "$guide")
printf 'urgent%sa.txt%swhy\n' "$tab" "$tab" | run handoff shipped 2>/dev/null && fail "a bad guide line writes nothing: unknown level"
printf 'high%snope.txt%swhy\n' "$tab" "$tab" | run handoff shipped 2>/dev/null && fail "a bad guide line writes nothing: path not changed"
printf 'high a.txt no tabs\n' | run handoff shipped 2>/dev/null && fail "a bad guide line writes nothing: malformed"
[ "$(cat "$guide")" = "$before" ] && [ ! -e "$guide.tmp" ] || fail "a bad guide line writes nothing"
run review shipped yours && [ "$(jq -r '.labels.review' "$fx/$ship_t.json")" = yours ] || fail "review accepts yours"
run kill shipped --worktree >/dev/null

# A new coordinator takes over children left by a dead one.
run spawn heir "Heir task" >/dev/null
heir_t=$(event spawn heir | jq -r .terminal)
echo 'this is not json {' >> "$ledger"
run spawn lost "Lost task" >/dev/null
lost_t=$(event spawn lost | jq -r .terminal)
run spawn gone "Gone task" >/dev/null
gone_t=$(event spawn gone | jq -r .terminal)
rm "$fx/$lost_t.json" "$fx/$gone_t.json" "$fx/t1.json"
git -C "$repo" worktree remove "$repo/.agent-worktrees/gone"
printf '{"address":"t3","labels":{"herdr.space":"spA","where":"Alpha / t3"}}' > "$fx/t3.json"
rm -f "$root/calls.log"
adopted=$(TEST_ME=t3 run adopt)
grep -qxF "adopted heir $heir_t" <<<"$adopted" || { echo "$adopted" >&2; fail "a new coordinator adopts children left by a dead one"; }
[ "$(jq -r '.labels.coord' "$fx/$heir_t.json")" = t3 ] || fail "the adopted child is relabelled to its new coordinator"
[ "$(event adopt heir | jq -r '.coord + .from_coord + .terminal + .space_name')" = "t3t1${heir_t}Alpha" ] || fail "adopt is recorded with the previous coordinator"
grep -qxF "orphaned lost $repo/.agent-worktrees/lost (branch agent/lost, no changes)" <<<"$adopted" || { echo "$adopted" >&2; fail "adopt reports a child whose terminal is gone as orphaned"; }
grep -qxF "orphaned gone $repo/.agent-worktrees/gone (branch agent/gone, worktree missing)" <<<"$adopted" || fail "an orphan with no worktree says so"
grep -q 'login-fix\|clean-one' <<<"$adopted" && fail "killed children are skipped"
grep -q 'adopted lost\|adopted gone' <<<"$adopted" && fail "orphans are not adopted"
[ -d "$repo/.agent-worktrees/lost" ] || fail "adopt never deletes a worktree"
calls | grep -q "hc kill\|hc rm" && fail "adopt never kills anything"

# adopt --from pulls children from another space into this one's own ledger.
printf '{"address":"t4","labels":{"herdr.space":"spC"}}' > "$fx/t4.json"
pulled=$(TEST_ME=t4 run adopt --from spA)
grep -qxF "adopted heir $heir_t" <<<"$pulled" || fail "adopt --from pulls children from another space"
[ "$(jq -r '.labels.coord' "$fx/$heir_t.json")" = t4 ] || fail "and relabels them"
spc="$COORDINATOR_HOME/spaces/spC/ledger.jsonl"
[ "$(event spawn heir "$spc" | jq -r .task)" = "Heir task" ] || fail "the new ledger holds the child's spawn record"
[ "$(event spawn lost "$spc" | jq -r .task)" = "Lost task" ] || fail "adopt --from keeps orphans in the new ledger"
[ "$(event spawn gone "$spc" | jq -r .task)" = "Gone task" ] || fail "adopt --from keeps orphans in the new ledger"
[ "$(event adopt heir "$spc" | jq -r '.from_space + .from_coord')" = spAt3 ] || fail "and where it came from"
TEST_ME=t4 run adopt --from spA >/dev/null
[ "$(jq -Rc 'fromjson? | select(.event == "spawn")' "$spc" | wc -l | tr -d ' ')" = 3 ] || fail "adopting again does not duplicate the copied events"
again=$(TEST_ME=t4 run adopt)
grep -qxF "adopted heir $heir_t" <<<"$again" || fail "the new ledger is self-sufficient"

# Without --model, the child runs on the model picked in the Team panel for the coordinator's space.
printf '{"spaces":{"spZ":{"enabled":true,"model":"sonnet","effort":"high"}}}' > "$root/settings.json"
printf '{"address":"t1","labels":{"herdr.space":"spZ"}}' > "$fx/t1.json"
: > "$root/calls.log"
HERDR_TEAM_SETTINGS="$root/settings.json" run spawn pick-model "Task" >/dev/null
calls | grep -q '"--model","sonnet","--effort","high"' || fail "the panel's model and effort are the default for a child"
: > "$root/calls.log"
HERDR_TEAM_SETTINGS="$root/settings.json" run spawn explicit "Task" --model opus >/dev/null
calls | grep -q '"--model","opus","--effort","high"' || fail "an explicit model wins, and the effort still follows the panel"
: > "$root/calls.log"
HERDR_TEAM_SETTINGS="$root/settings.json" run spawn lowest "Task" --effort low >/dev/null
calls | grep -q '"--effort","low"' || fail "an explicit effort wins"

# The child is told its coordinator's name, from the session registry.
mkdir -p "$root/sessions"
printf '{"sessionId":"s9","name":"boss"}' > "$root/sessions/a.json"
printf '{"sessionId":"s9","name":"leaked"}' > "$root/sessions/a.key"
printf '{"address":"t5","labels":{"herdr.space":"spZ","claude.session":"s9"}}' > "$fx/t5.json"
: > "$root/calls.log"
CLAUDE_SESSIONS_DIR="$root/sessions" TEST_ME=t5 run spawn told "Task" >/dev/null
calls | grep -qF 'Your coordinator is boss (terminal t5); report to it with SendMessage to boss.' || { dump; fail "the child is told its coordinator's name"; }
: > "$root/calls.log"
CLAUDE_SESSIONS_DIR="$root/none" TEST_ME=t5 run spawn untold "Task" >/dev/null
calls | grep -qF 'Your coordinator is terminal t5.' || fail "without a session name it gets the terminal"

# Many coordinators share a space: each changes only its own children, and any of them may read.
for c in c1:spM:coordinator c2:spM:coordinator c3:spN:coordinator c4:spM:; do
  IFS=: read -r a sp role <<<"$c"
  jq -n --arg a "$a" --arg sp "$sp" --arg role "$role" '{address: $a, labels: ({"herdr.space": $sp} + (if $role == "" then {} else {role: $role} end))}' > "$fx/$a.json"
done
spm="$COORDINATOR_HOME/spaces/spM/ledger.jsonl"
TEST_ME=c1 run spawn mine "Mine" >/dev/null
mine_t=$(event spawn mine "$spm" | jq -r .terminal)
TEST_ME=c2 run spawn theirs "Theirs" >/dev/null
TEST_ME=c2 run spawn mine "Again" 2>/dev/null && fail "a child name is unique across the space"
TEST_ME=c1 run spawn login-fix "Again" 2>/dev/null && fail "a name whose agent branch is left in the repo is refused"
: > "$root/calls.log"
refused_by_c1() { local msg; ! msg=$(TEST_ME=c2 run "$@" 2>&1 </dev/null) && grep -qF 'mine belongs to coordinator c1; ask it over SendMessage' <<<"$msg"; }
refused_by_c1 review mine approved || fail "review refuses another coordinator's child and names it"
refused_by_c1 handoff mine || fail "handoff refuses another coordinator's child and names it"
refused_by_c1 kill mine --worktree --force || fail "kill refuses another coordinator's child and names it"
[ "$(jq -r '.labels.review + .labels.coord' "$fx/$mine_t.json")" = pendingc1 ] || fail "a refused command changes no label"
calls | grep -q 'hc kill' && fail "a refused kill stops nothing"
[ -d "$repo/.agent-worktrees/mine" ] || fail "a refused kill keeps the worktree"
echo peek > "$repo/.agent-worktrees/mine/peek.txt"; git -C "$repo/.agent-worktrees/mine" add peek.txt
TEST_ME=c2 run diff mine | grep -q '^+peek' || fail "diff works on any child in the space"
TEST_ME=c2 run ls | grep -q '^mine ' && fail "plain ls lists only the caller's own children"
every=$(TEST_ME=c2 run ls --all)
grep -q "^mine  *$mine_t  *c1  *working  *pending" <<<"$every" && grep -q '^theirs .* c2 ' <<<"$every" || { echo "$every" >&2; fail "ls --all lists every child in the space with its coord"; }
grep -q '^heir ' <<<"$every" && fail "ls --all stays inside the caller's space"
[ "$(TEST_ME=c2 run ls --all --json | jq -r 'map(.name + "=" + .coord) | sort | join(" ")')" = "mine=c1 theirs=c2" ] || fail "ls --all --json gives each child's coord"

echo "hcoord: all checks passed"
