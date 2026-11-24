#!/usr/bin/env bash
set -euo pipefail

hcoord="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hcoord"
root="$(mktemp -d)"
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
    n=$(( $(ls "$fx" | wc -l) + 8 ))
    printf '{"address":"t%s","status":{"state":"working"},"labels":{"herdr.tab":"tb%s"}}' "$n" "$n" > "$fx/t$n.json"
    printf '{"space":"sp1","tab":"tb%s","terminal":"t%s"}' "$n" "$n" ;;
esac
STUB
chmod +x "$bin/hc" "$bin/herdr-app"

git init -q -b main "$repo"
git -C "$repo" -c user.email=a@b -c user.name=t commit -q --allow-empty -m init
echo one > "$repo/a.txt"; git -C "$repo" add a.txt; git -C "$repo" -c user.email=a@b -c user.name=t commit -q -m "add a"

printf '{"address":"t1","labels":{"herdr.space":"spA"}}' > "$fx/t1.json"
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

run review login-fix changes "too big" && [ "$(jq -r '.labels.review' "$fx/$terminal.json")" = changes ] || fail "review sets the label"
[ "$(jq -r '.labels.review_note' "$fx/$terminal.json")" = "too big" ] || fail "with its note"
run review login-fix maybe 2>/dev/null && fail "review states are checked"

run kill login-fix --worktree 2>/dev/null && fail "a worktree with changes is not removed"
calls | grep -q 'hc kill' && fail "and the agent is left running when that happens"
run kill login-fix --worktree --force >/dev/null
calls | grep -q "hc kill $terminal" || fail "kill stops the agent"
calls | grep -q 'tab.close --id tb' || fail "and closes its tab"
[ ! -d "$repo/.agent-worktrees/login-fix" ] || fail "a forced kill removes the worktree"
git -C "$repo" rev-parse --verify -q agent/login-fix >/dev/null || fail "but the branch stays"

run spawn clean-one "Another task" >/dev/null
run kill clean-one --worktree >/dev/null
[ ! -d "$repo/.agent-worktrees/clean-one" ] || fail "a clean worktree is removed without force"

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

echo "hcoord: all checks passed"
