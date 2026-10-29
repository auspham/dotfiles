#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

test_home="$test_root/home"
test_bin="$test_root/bin"
test_log="$test_root/hooks.log"
runtime_dir="$test_root/run"
mkdir -p "$test_home/.config/agent-hooks" "$test_bin" "$runtime_dir"
cp "$repo_root"/agent-hooks/*.sh "$test_home/.config/agent-hooks/"

cat > "$test_bin/tmux" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  display-message)
    format="${@: -1}"
    case "$format" in
      '#{window_id}') printf '%s\n' '@0' ;;
      '#{pane_id}') printf '%s\n' '%0' ;;
      '#{window_name}') printf '%s\n' 'Implement AI Worker Feature' ;;
    esac
    ;;
  capture-pane)
    if [ -n "${TMUX_CAPTURE_FOOTER_FILE:-}" ]; then
      cat "$TMUX_CAPTURE_FOOTER_FILE"
    else
      printf '%s\n' "${TMUX_CAPTURE_FOOTER:-○ Working · esc interrupt}"
    fi
    ;;
  rename-window|set-window-option)
    printf 'tmux %s\n' "$*" >> "$TEST_LOG"
    ;;
esac
EOF

cat > "$test_bin/setsid" <<'EOF'
#!/usr/bin/env bash
printf 'setsid %s\n' "$*" >> "$TEST_LOG"
EOF

cat > "$test_bin/canberra-gtk-play" <<'EOF'
#!/usr/bin/env bash
printf 'sound %s\n' "$*" >> "$TEST_LOG"
EOF

chmod +x "$test_bin"/*
: > "$test_log"

run_hook() {
  local script="$1" input="$2"
  printf '%s' "$input" | env \
    HOME="$test_home" \
    PATH="$test_bin:$PATH" \
    TEST_LOG="$test_log" \
    TMUX='test' \
    TMUX_PANE='%0' \
    TMUX_CAPTURE_FOOTER="${TMUX_CAPTURE_FOOTER:-○ Working · esc interrupt}" \
    XDG_RUNTIME_DIR="$runtime_dir" \
    bash "$test_home/.config/agent-hooks/$script"
}

state() {
  read -r value _ < "$runtime_dir/agent-hooks/0.state"
  printf '%s' "$value"
}

agent_count() {
  local dir="$runtime_dir/agent-hooks/0.agents"
  [ -d "$dir" ] || {
    printf '0'
    return
  }
  find "$dir" -maxdepth 1 -type f | wc -l
}

sound_count() {
  grep -c '^sound .*complete\.oga' "$test_log" || true
}

input_sound_count() {
  grep -c '^sound .*bell\.oga' "$test_log" || true
}

non_completion_sound_count() {
  awk '/^sound / && $0 !~ /complete\.oga/ { count++ } END { print count + 0 }' "$test_log"
}

run_spinner() {
  local footer="$1" current generation
  read -r current generation _ < "$runtime_dir/agent-hooks/0.state"
  env \
    HOME="$test_home" \
    PATH="$test_bin:$PATH" \
    TEST_LOG="$test_log" \
    TMUX='test' \
    TMUX_PANE='%0' \
    TMUX_CAPTURE_FOOTER="$footer" \
    XDG_RUNTIME_DIR="$runtime_dir" \
    hook_cancel_grace_frames=0 \
    hook_cancel_check_frames=1 \
    hook_cancel_idle_hits=1 \
    bash "$test_home/.config/agent-hooks/spin.sh" '@0' 'Implement AI Worker Feature' "$generation" '%0'
}

assert_equal() {
  local expected="$1" actual="$2" label="$3"
  if [ "$actual" != "$expected" ]; then
    printf 'FAIL: %s: expected %s, got %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

parent='{"session_id":"parent-session"}'
child_one='{"session_id":"toolu_child_one"}'
child_two='{"session_id":"toolu_child_two"}'

run_hook working.sh "$parent"
run_hook working.sh "$child_one"
run_hook working.sh "$child_two"
assert_equal working "$(state)" 'three agents start working'
assert_equal 3 "$(agent_count)" 'three active agents are tracked'

run_hook done.sh "$parent"
assert_equal working "$(state)" 'parent stop keeps background spinner'
assert_equal 2 "$(agent_count)" 'parent marker is removed'
assert_equal 0 "$(sound_count)" 'parent stop does not sound while children work'

run_hook done.sh "$child_one"
assert_equal working "$(state)" 'first child stop keeps spinner'
assert_equal 1 "$(agent_count)" 'one child remains active'

run_hook done.sh "$child_two"
assert_equal finishing "$(state)" 'last child waits for background work to settle'
assert_equal 0 "$(agent_count)" 'all active markers are removed'
assert_equal 0 "$(sound_count)" 'agent stop does not sound before the pane is idle'

footer_file="$test_root/footer"
printf '%s\n' '○ Working · esc interrupt' > "$footer_file"
read -r _ generation _ < "$runtime_dir/agent-hooks/0.state"
env \
  HOME="$test_home" \
  PATH="$test_bin:$PATH" \
  TEST_LOG="$test_log" \
  TMUX='test' \
  TMUX_PANE='%0' \
  TMUX_CAPTURE_FOOTER_FILE="$footer_file" \
  XDG_RUNTIME_DIR="$runtime_dir" \
  hook_cancel_grace_frames=0 \
  hook_cancel_check_frames=1 \
  hook_cancel_idle_hits=1 \
  bash "$test_home/.config/agent-hooks/spin.sh" '@0' 'Implement AI Worker Feature' "$generation" '%0' &
spinner_pid=$!
sleep 0.3
assert_equal finishing "$(state)" 'background shell keeps the window spinning'
printf '%s\n' \
  '← open       · / commands · ? help · tab next  · space hold to' \
  '  sidebar        tab                               record' \
  'GPT-5.6 Sol · 1.1M context' > "$footer_file"
wait "$spinner_pid"
assert_equal done "$(state)" 'narrow-pane idle footer completes the finishing state'
assert_equal 1 "$(sound_count)" 'last child produces one completion sound'

run_hook tool-input.sh '{"session_id":"parent-session","tool_name":"Bash"}'
assert_equal working "$(state)" 'tool use recovers an autonomous resume'
assert_equal 1 "$(agent_count)" 'autonomous agent is tracked'
run_hook done.sh "$parent"
assert_equal finishing "$(state)" 'autonomous stop waits for the idle footer'
run_spinner 'commands ? help'
assert_equal done "$(state)" 'autonomous resume completes normally'
assert_equal 2 "$(sound_count)" 'autonomous completion sounds once'

TMUX_CAPTURE_FOOTER='commands ? help' run_hook tool-input.sh '{"session_id":"parent-session","tool_name":"Bash"}'
assert_equal done "$(state)" 'late tool event does not resurrect an idle window'
assert_equal 0 "$(agent_count)" 'late tool event does not recreate an active marker'

run_hook working.sh "$parent"
run_hook input-needed.sh \
  '{"session_id":"parent-session","notification_type":"permission"}'
assert_equal input "$(state)" 'permission prompt pauses the spinner'
assert_equal 0 "$(non_completion_sound_count)" 'permission prompt stays silent'
run_hook tool-input.sh '{"session_id":"parent-session","tool_name":"Bash"}'
assert_equal working "$(state)" 'auto-approved permission resumes the spinner'

run_hook tool-input.sh '{"session_id":"parent-session","tool_name":"AskUserQuestion"}'
assert_equal input "$(state)" 'input tool pauses the spinner'
assert_equal 1 "$(agent_count)" 'waiting agent remains tracked'
assert_equal 1 "$(input_sound_count)" 'input tool sounds once'
run_hook tool-input.sh '{"session_id":"parent-session","tool_name":"AskUserQuestion"}'
assert_equal 1 "$(input_sound_count)" 'duplicate input event stays silent'
run_hook input-answered.sh '{"session_id":"parent-session","tool_name":"AskUserQuestion"}'
assert_equal working "$(state)" 'answer resumes the spinner'
run_hook done.sh "$parent"
assert_equal finishing "$(state)" 'answered turn waits for the idle footer'
run_spinner 'commands ? help'
assert_equal done "$(state)" 'answered turn completes normally'

run_hook working.sh "$parent"
run_spinner 'commands ? help'
assert_equal cancelled "$(state)" 'watchdog marks an unhooked stop as cancelled'
assert_equal 0 "$(agent_count)" 'watchdog clears stale active markers'
run_hook done.sh "$parent"
assert_equal cancelled "$(state)" 'late stop preserves the cancelled state'
assert_equal 3 "$(sound_count)" 'late stop after cancellation is silent'

run_hook working.sh "$parent"
run_hook done.sh "$parent"
read -r _ generation _ < "$runtime_dir/agent-hooks/0.state"
env \
  HOME="$test_home" \
  PATH="$test_bin:$PATH" \
  TEST_LOG="$test_log" \
  TMUX='test' \
  TMUX_PANE='%0' \
  TMUX_CAPTURE_FOOTER='○ Working · esc interrupt' \
  XDG_RUNTIME_DIR="$runtime_dir" \
  hook_cancel_grace_frames=100 \
  hook_spinner_max_frames=2 \
  bash "$test_home/.config/agent-hooks/spin.sh" '@0' 'Implement AI Worker Feature' "$generation" '%0'
assert_equal cancelled "$(state)" 'orphan guard cancels a finishing spinner'
assert_equal 3 "$(sound_count)" 'orphan guard is silent'

run_hook working.sh "$child_one"
run_hook working.sh "$child_two"
run_hook done.sh "$child_one" &
first_pid=$!
run_hook done.sh "$child_two" &
second_pid=$!
wait "$first_pid" "$second_pid"
assert_equal finishing "$(state)" 'concurrent final stops enter finishing once'
assert_equal 0 "$(agent_count)" 'concurrent stops remove all markers'
run_spinner 'commands ? help'
assert_equal done "$(state)" 'concurrent final stops complete after idle'
assert_equal 4 "$(sound_count)" 'concurrent final stops produce one completion sound'

claude_pane="$test_root/claude-pane.txt"
claude_transcript="$test_root/claude-transcript.jsonl"

claude_lib() {
  env \
    HOME="$test_home" \
    PATH="$test_bin:$PATH" \
    TEST_LOG="$test_log" \
    TMUX='test' \
    TMUX_PANE='%0' \
    TMUX_CAPTURE_FOOTER_FILE="$claude_pane" \
    XDG_RUNTIME_DIR="$runtime_dir" \
    HOOK_AGENT=claude \
    HOOK_INPUT="${HOOK_INPUT:-}" \
    bash -c 'source "$HOME/.config/agent-hooks/lib.sh"; '"$1"
}

claude_pane_state() {
  printf '%s\n' "$@" > "$claude_pane"
  claude_lib 'hook_pane_working %0 && echo busy || echo idle'
}

claude_footer=(
  '────────'
  '❯ '
  '────────'
  '  Opus 5.5 | effort: xhigh | ctx: 4% of 1M | 5h: 1% | 7d: 15%'
  '  ⏵⏵ auto mode on (shift+tab to cycle)'
)
assert_equal busy "$(claude_pane_state '✶ Creating… (13s · ↓ 892 tokens)' "${claude_footer[@]}")" 'claude activity line is busy'
assert_equal busy "$(claude_pane_state '✶ Creating… (2s)' '  ☐ Task one' '  ☐ Task two' "${claude_footer[@]}")" 'claude activity line above a task list is busy'
assert_equal busy "$(claude_pane_state '✳ Thinking… (esc to interrupt)' "${claude_footer[@]}")" 'legacy claude interrupt hint is busy'
assert_equal idle "$(claude_pane_state '✻ Churned for 8s · done 9:10 PM' "${claude_footer[@]}")" 'claude turn summary is idle'
assert_equal busy "$(claude_pane_state 'Do you want to proceed?' '  1. Yes')" 'claude pane without an input box is assumed busy'

printf '%s\n' \
  '{"type":"ai-title","aiTitle":"Generated title"}' \
  '{"type":"user","message":"mentions \"type\":\"ai-title\" in passing"}' \
  > "$claude_transcript"
HOOK_INPUT="{\"transcript_path\":\"$claude_transcript\"}"
assert_equal 'Generated title' "$(claude_lib hook_session_name)" 'claude window is named after the generated title'
printf '%s\n' \
  '{"type":"custom-title","customTitle":"Renamed title"}' \
  '{"type":"ai-title","aiTitle":"Newer generated title"}' \
  >> "$claude_transcript"
assert_equal 'Renamed title' "$(claude_lib hook_session_name)" 'claude /rename title wins over the generated title'
HOOK_INPUT='{}'
assert_equal 'Implement AI Worker Feature' "$(claude_lib hook_session_name)" 'claude keeps the window name without a transcript'

printf '%s\n' '{"type":"ai-title","aiTitle":"Title from mid-turn"}' > "$claude_transcript"
printf '%s\n' '✶ Creating… (3s)' "${claude_footer[@]}" > "$claude_pane"
printf '%s' "{\"session_id\":\"claude-session\",\"transcript_path\":\"$claude_transcript\"}" | env \
  HOME="$test_home" \
  PATH="$test_bin:$PATH" \
  TEST_LOG="$test_log" \
  TMUX='test' \
  TMUX_PANE='%0' \
  XDG_RUNTIME_DIR="$runtime_dir" \
  HOOK_AGENT=claude \
  bash "$test_home/.config/agent-hooks/working.sh"
for _ in $(seq 20); do
  grep -q "^setsid .*spin\.sh @0 Title from mid-turn .* $claude_transcript\$" "$test_log" && break
  sleep 0.05
done
grep -q "^setsid .*spin\.sh @0 Title from mid-turn .* $claude_transcript\$" "$test_log" \
  || { printf 'FAIL: claude spinner receives the transcript path\n' >&2; exit 1; }
read -r _ generation _ < "$runtime_dir/agent-hooks/0.state"
printf '%s\n' '{"type":"ai-title","aiTitle":"Refreshed title"}' >> "$claude_transcript"
env \
  HOME="$test_home" \
  PATH="$test_bin:$PATH" \
  TEST_LOG="$test_log" \
  TMUX='test' \
  TMUX_PANE='%0' \
  TMUX_CAPTURE_FOOTER_FILE="$claude_pane" \
  XDG_RUNTIME_DIR="$runtime_dir" \
  HOOK_AGENT=claude \
  hook_spinner_max_frames=1 \
  bash "$test_home/.config/agent-hooks/spin.sh" '@0' 'claude' "$generation" '%0' "$claude_transcript"
grep -q '^tmux rename-window -t @0 ⠋ Refreshed title$' "$test_log" \
  || { printf 'FAIL: claude spinner refreshes the title mid-turn\n' >&2; exit 1; }

printf 'All agent hook lifecycle tests passed.\n'
