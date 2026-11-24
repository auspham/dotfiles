#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
bin="$root/bin"
mkdir -p "$bin"

# The function under test, cut out of .zshrc between its markers.
sed -n '/# herdr-claude-name:begin/,/# herdr-claude-name:end/p' "$repo_root/.zshrc" > "$root/block.zsh"
[ -s "$root/block.zsh" ] || { echo "FAIL: the block is not in .zshrc" >&2; exit 1; }

# A stub claude that prints what it was given, and a stub hc whose answers the tests set.
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*"\n' > "$bin/claude"
cat > "$bin/hc" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  get) printf '{"labels":{"where":"%s"}}' "${TEST_WHERE-}" ;;
  ls) printf '{"terminals":[%s]}' "${TEST_OTHERS-}" ;;
esac
STUB
chmod +x "$bin/claude" "$bin/hc"

run() { env PATH="$bin:$PATH" HC_TERMINAL_ID="${HC_TERMINAL_ID-t26}" zsh -c "source '$root/block.zsh'; claude $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

export TEST_WHERE="excalidraw / 2"
[ "$(run --foo bar)" = "--name excalidraw-2 --foo bar" ] || fail "a session is named after its space and tab"
[ "$(run)" = "--name excalidraw-2" ] || fail "a bare claude is named too"
[ "$(TEST_WHERE='my space / 3' run)" = "--name my-space-3" ] || fail "spaces become hyphens"

[ "$(TEST_OTHERS='{"agent":"claude-code","where":"excalidraw / 2","address":"t9"}' run)" = "--name excalidraw-2-t26" ] || fail "a second agent in a split gets its terminal address"
[ "$(TEST_OTHERS='{"agent":"claude-code","where":"other / 1","address":"t9"}' run)" = "--name excalidraw-2" ] || fail "an agent in another tab does not matter"

[ "$(run --name mine --foo)" = "--name mine --foo" ] || fail "an explicit --name is respected"
[ "$(run -n mine)" = "-n mine" ] || fail "and so is -n"
[ "$(run mcp list)" = "mcp list" ] || fail "subcommands are left alone"
[ "$(run update)" = "update" ] || fail "update is a subcommand"
[ "$(HC_TERMINAL_ID='' run --foo)" = "--foo" ] || fail "outside herdr nothing is added"
[ "$(TEST_WHERE='' run --foo)" = "--foo" ] || fail "with no herdr label nothing is added"

echo "claude-herdr-name: all checks passed"
