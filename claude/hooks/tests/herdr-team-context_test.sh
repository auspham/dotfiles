#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
hook="$repo_root/claude/hooks/herdr-team-context.sh"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT

home="$root/home" bin="$root/bin" sessions="$root/sessions"
mkdir -p "$home" "$bin" "$sessions"

# A stub hc: terminals t1 (this agent) and t2 (a peer) share space spA; t3 is in another space; t4's
# session is no longer alive.
cat > "$bin/hc" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  ls) printf '{"terminals":[{"address":"t1","agent":"claude-code"},{"address":"t2","agent":"claude-code"},{"address":"t3","agent":"claude-code"},{"address":"t4","agent":"claude-code"},{"address":"t5","agent":"zsh"}]}' ;;
  get)
    case "$2" in
      t1) printf '{"address":"t1","title":"me","cwd":"/w/app","labels":{"herdr.space":"spA","where":"alpha / 1","claude.session":"s1"}}' ;;
      t2) printf '{"address":"t2","title":"fixing the login bug","cwd":"/w/api","labels":{"herdr.space":"spA","where":"alpha / 2","claude.session":"s2"}}' ;;
      t3) printf '{"address":"t3","title":"other project","cwd":"/w/other","labels":{"herdr.space":"spB","where":"beta / 1","claude.session":"s3"}}' ;;
      t4) printf '{"address":"t4","title":"gone","cwd":"/w/old","labels":{"herdr.space":"spA","where":"alpha / 3","claude.session":"s4"}}' ;;
    esac ;;
esac
STUB
chmod +x "$bin/hc"

write_session() { printf '{"sessionId":"%s","name":"%s","status":"%s"}' "$1" "$2" "$3" > "$sessions/$4.json"; }
write_session s1 me-agent busy 100
write_session s2 api-agent idle 200
write_session s3 other-agent idle 300
printf 'SECRET-TOKEN' > "$sessions/200.abc.key"

run() { # event session [extra json]
  printf '{"hook_event_name":"%s","session_id":"%s"%s}' "$1" "$2" "${3:-}" |
    env PATH="$bin:$PATH" HOME="$home" XDG_STATE_HOME="$root/state" CLAUDE_SESSIONS_DIR="$sessions" HC_TERMINAL_ID="${HC_TERMINAL_ID-t1}" "$hook"
}
fail() { echo "FAIL: $*" >&2; exit 1; }
context() { jq -r '.hookSpecificOutput.additionalContext'; }

out=$(run SessionStart s1 | context)
grep -q 'api-agent \[t2\] idle: fixing the login bug, in api' <<<"$out" || fail "peer in the same space is listed"
grep -q 'You are me-agent' <<<"$out" || fail "the agent is told its own name"
grep -q 'space "alpha"' <<<"$out" || fail "the space name is given"
grep -q 'other-agent' <<<"$out" && fail "a peer in another space is hidden"
grep -q 'gone' <<<"$out" && fail "a peer whose session is gone is hidden"
grep -q 'SECRET-TOKEN' <<<"$out" && fail "credential files are never read"
[ "$(run SessionStart s1 | jq -r '.hookSpecificOutput.hookEventName')" = SessionStart ] || fail "the reply names its event"
[ "${#out}" -lt 1500 ] || fail "the context stays short"

run UserPromptSubmit s1 | jq -e . >/dev/null 2>&1 && fail "a prompt is silent when the peers did not change"
write_session s5 new-agent idle 500
sed -i 's/"herdr.space":"spB","where":"beta \/ 1","claude.session":"s3"/"herdr.space":"spA","where":"alpha \/ 4","claude.session":"s5"/' "$bin/hc"
out=$(run UserPromptSubmit s1 | context)
grep -q 'new-agent' <<<"$out" || fail "a prompt repeats the roster when a peer joined"
[ -z "$(run UserPromptSubmit s1)" ] || fail "and is silent again afterwards"
[ -n "$(run SessionStart s1)" ] || fail "a session start always repeats the roster"

[ -z "$(run SessionStart s1 ',"agent_id":"sub1"')" ] || fail "a sub-agent says nothing"
[ -z "$(HC_TERMINAL_ID='' run SessionStart s1)" ] || fail "outside herdr it says nothing"
[ -z "$(run SessionStart s9)" ] || fail "an unknown session says nothing"
[ -z "$(run Stop s1)" ] || fail "other events say nothing"
rm "$sessions/200.json" "$sessions/500.json"
[ -z "$(run SessionStart s1)" ] || fail "with no peers it says nothing"

echo "herdr-team-context: all checks passed"
