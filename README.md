Simply:


`cp -r nvim ~/.config/nvim`
`cp -r neovide ~/.config/neovide`


Download JetbrainsMono Nerd Font

## Agent hooks (Copilot CLI + Claude Code)
`mkdir -p ~/.config/agent-hooks && cp agent-hooks/*.sh ~/.config/agent-hooks/ && chmod +x ~/.config/agent-hooks/*.sh`
Run `bash agent-hooks/tests/hooks_test.sh` to check the lifecycle after changing them.

## Copilot CLI
`cp copilot/settings.json copilot/copilot-instructions.md ~/.copilot/` (install the agent hooks above first)
Hooks (share `agent-hooks/lib.sh`) drive a per-window tmux state machine named after the session: while any parent agent, background agent, or agent-owned shell command works, an animated braille spinner (`spin.sh`, ~8fps, blue) runs on the window. UserPromptSubmit and PreToolUse register the active session ID, including autonomous resumes that have no new user prompt; Stop removes only that session. After the final agent stops, the window enters a `finishing` spinner state until Copilot's own footer reports idle, so a remote build running in another pane does not produce a premature green `✓`. The done marker and completion sound appear only after that idle transition. Per-window locking serializes concurrent lifecycle hooks. When the agent needs input it shows a yellow `(?)`; `AskUserQuestion` (ask_user) and `exit_plan_mode` (plan ready for review) also sound once when entering that state, while permission and elicitation notifications remain silent. The matching PostToolUse hook resumes the spinner once the answer or plan is resolved. The cancellation watchdog clears stale active-agent markers when Copilot returns to its idle prompt without firing Stop. Styles, markers, spinner frames and sounds are centralised in `lib.sh` (`hook_style_*`, `hook_marker_*`, `hook_spinner_frames`, `hook_spinner_delay`, `hook_sound_*`). For debugging, `touch ~/.config/agent-hooks/.debug` to log raw hook payloads to `~/.config/agent-hooks/debug.log` (`rm` the sentinel to stop). The hooks are global across every running Copilot session, so each hook first checks `hook_in_tmux` (`$TMUX`/`$TMUX_PANE`) and no-ops for headless or piped runs: those make no sound and never grab the active pane (`hook_pane` only falls back to `tmux display-message` when `$TMUX` is set).

## Claude Code
`mkdir -p ~/.claude && cp claude/settings.json claude/CLAUDE.md ~/.claude/` (install the agent hooks above first, and fill in the redacted `!Name` path shortcuts in `CLAUDE.md`)
Claude Code shares the same `~/.config/agent-hooks/*.sh` tmux spinner/sound hooks: `claude/settings.json` wires UserPromptSubmit, PreToolUse, PostToolUse, Notification and Stop to them with `HOOK_AGENT=claude`. That switches the footer probe in `lib.sh` to Claude's busy indicator (the live activity line above the input box, e.g. `✶ Creating… (13s · ↓ 892 tokens)`, or `esc to interrupt` on older versions) instead of Copilot's idle footer, adds `ExitPlanMode` as an input tool, and names the window after the conversation title read from the transcript (a `/rename` title wins over the generated one). The spinner re-reads the title every ~5s, since Claude generates it partway through the first turn, and falls back to `claude` until then.

The `settings.json` status line shows the model, effort, context usage with window size (`ctx: 4% of 1M`) and 5-hour/7-day rate limits, with `-` placeholders until the first response arrives.

## lazygit
`mkdir -p ~/.config/lazygit && cp lazygit/config.yml ~/.config/lazygit/config.yml`

## WezTerm
`cp .wezterm.lua ~/`
JetBrainsMono Nerd Font Mono @ 12 (download the Nerd Font above), `Dark+` color scheme (VSCode's default dark theme, bundled with WezTerm), 0.95 background opacity, minimal window (title-bar buttons integrated into the tab bar, which hides itself at a single tab), zeroed top/bottom padding so content fills the height, and system + visual bell. `custom_block_glyphs` is off so braille (e.g. the tmux copilot spinner) renders from the font on the baseline. WezTerm auto-reloads the config on save.
