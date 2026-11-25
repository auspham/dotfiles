#!/usr/bin/env bash
set -euo pipefail

hook="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/herdr-session-end.sh"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/bin"

cat > "$root/bin/hc" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  get) printf '{"labels":{"claude.session":"%s"}}' "${TEST_LABEL_SESSION:-s1}" ;;
  label) shift; echo "$*" >> "${TEST_LOG}" ;;
esac
STUB
chmod +x "$root/bin/hc"

run() { printf '{"reason":"%s","session_id":"%s"%s}' "$1" "$2" "${3:-}" | env PATH="$root/bin:$PATH" TEST_LOG="$root/log" HC_TERMINAL_ID=t1 "$hook"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

run prompt_input_exit s1
grep -q 't1 claude.session= role= coord=' "$root/log" || fail "leaving on purpose clears the session and the role"
grep -q 'coord= owner=' "$root/log" || fail "leaving on purpose clears the owner of a lent child"

rm -f "$root/log"
run other s1
[ ! -f "$root/log" ] || fail "a cut-off session keeps its labels so it can be resumed"

run prompt_input_exit s2
[ ! -f "$root/log" ] || fail "a session that is not the labelled one changes nothing"

echo "herdr-session-end: all checks passed"
