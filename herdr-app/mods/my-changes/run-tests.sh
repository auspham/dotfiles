#!/usr/bin/env bash
# Runs a project's tests and records the outcome for the Changes panel.
#   run-tests.sh run <folder>   run the tests, print their output, record the result
#   run-tests.sh fp <folder>    print a fingerprint of the working tree
#   run-tests.sh cmd <folder>   print the test command (empty when none is found)
#   run-tests.sh status <folder>  print {cmd, fp, result} as JSON for the panel
# A file named <key>.cmd next to the results overrides the detected command.
set -u

mode=${1:-}
root=$(cd "${2:-.}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || { echo "Not a git repository" >&2; exit 2; }
state="${XDG_CACHE_HOME:-$HOME/.cache}/herdr-tests"
mkdir -p "$state"
key=$(printf %s "$root" | sha1sum | cut -c1-16)
result="$state/$key.json"

git_read() { git -C "$root" --no-optional-locks -c core.fsmonitor=false "$@"; }

detect() {
  if [ -s "$state/$key.cmd" ]; then head -1 "$state/$key.cmd"; return; fi
  cd "$root" || return
  if [ -f pytest.ini ] || [ -f tox.ini ] || [ -f conftest.py ] || [ -f pyproject.toml ] || [ -f setup.cfg ] \
    || compgen -G "tests/test_*.py" >/dev/null || compgen -G "test_*.py" >/dev/null; then
    # `python -m` puts the project on the import path, as running from its root expects.
    local py=python3
    for venv in .venv venv; do [ -x "$venv/bin/python" ] && { py="$venv/bin/python"; break; }; done
    echo "$py -m pytest -q -p no:cacheprovider"
  elif [ -f package.json ] && jq -e '.scripts.test and (.scripts.test | test("no test specified") | not)' package.json >/dev/null 2>&1; then
    if [ -f pnpm-lock.yaml ]; then echo "pnpm test"; elif [ -f yarn.lock ]; then echo "yarn test"; elif [ -f bun.lockb ] || [ -f bun.lock ]; then echo "bun run test"; else echo "npm test --silent"; fi
  elif [ -f Cargo.toml ]; then echo "cargo test"
  elif [ -f go.mod ]; then echo "go test ./..."
  elif [ -f Makefile ] && grep -qE '^test:' Makefile; then echo "make test"
  fi
}

fingerprint() {
  {
    if git_read rev-parse --verify -q HEAD >/dev/null; then git_read diff HEAD; else git_read diff --cached; git_read diff; fi
    (cd "$root" && git_read ls-files -o --exclude-standard -z | xargs -0 -r sha1sum)
  } | sha1sum | cut -c1-16
}

record() {
  local tmp="$result.$$"
  jq -n --arg root "$root" --arg cmd "$1" --arg fp "$2" --argjson at "$3" --argjson running "$4" --argjson code "$5" --arg summary "$6" \
    '{root: $root, cmd: $cmd, fp: $fp, at: $at, running: $running, code: $code, summary: $summary}' > "$tmp" && mv "$tmp" "$result"
}

case "$mode" in
  cmd) detect ;;
  fp) fingerprint ;;
  status)
    last=null
    [ -s "$result" ] && last=$(cat "$result")
    jq -n --arg cmd "$(detect)" --arg fp "$(fingerprint)" --argjson result "$last" '{cmd: $cmd, fp: $fp, result: $result}'
    ;;
  run)
    cmd=$(detect)
    [ -n "$cmd" ] || { echo "No test command found for $root" >&2; exit 3; }
    fp=$(fingerprint)
    at=$(date +%s)
    record "$cmd" "$fp" "$at" true null ""
    log="$state/$key.log"
    (cd "$root" && PYTHONDONTWRITEBYTECODE=1 timeout 900 bash -c "$cmd") 2>&1 | tee "$log"
    code=${PIPESTATUS[0]}
    summary=$(grep -v '^[[:space:]]*$' "$log" | tail -1 | sed -E 's/^[=[:space:]]+//; s/[=[:space:]]+$//' | cut -c1-140)
    [ "$code" = 124 ] && summary="Timed out after 15 minutes"
    record "$cmd" "$fp" "$at" false "$code" "$summary"
    exit "$code"
    ;;
  *) echo "usage: run-tests.sh run|fp|cmd <folder>" >&2; exit 2 ;;
esac
