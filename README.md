Simply:


`cp -r nvim ~/.config/nvim`
`cp -r neovide ~/.config/neovide`


Download JetbrainsMono Nerd Font

## Copilot CLI
`cp copilot/settings.json copilot/copilot-instructions.md ~/.copilot/`
`mkdir -p ~/.copilot/hooks && cp copilot/hooks/*.sh ~/.copilot/hooks/ && chmod +x ~/.copilot/hooks/*.sh`
Hooks (share `hooks/lib.sh`) drive a per-window tmux state machine named after the session: while the agent works, an animated braille spinner (`copilot-spin.sh`, ~8fps, blue) runs on the window (UserPromptSubmit starts it, Stop replaces it with a green `✓` + `bell`-family done sound). The spinner is a self-terminating background loop per working window (~2% of one core while active, 0 when idle); it stops the instant the state file leaves `working` or its generation token is superseded. When the agent needs input it shows a yellow `(?)` + `bell` sound, fired by the Notification hook and a PreToolUse hook matching the input tools `AskUserQuestion` (ask_user) and `exit_plan_mode` (plan ready for review); the matching PostToolUse hook resumes the spinner once the answer/plan is resolved. Styles, markers, spinner frames and sounds are centralised in `lib.sh` (`hook_style_*`, `hook_marker_*`, `hook_spinner_frames`, `hook_spinner_delay`, `hook_sound_input`, `hook_sound_done`). For debugging, `touch ~/.copilot/hooks/.debug` to log raw hook payloads to `hooks/debug.log` (`rm` the sentinel to stop). The hooks are global across every running Copilot session, so each hook first checks `hook_in_tmux` (`$TMUX`/`$TMUX_PANE`) and no-ops for headless/piped runs: those make no sound and never grab the active pane (`hook_pane` only falls back to `tmux display-message` when `$TMUX` is set). In-tmux sessions (incl. background tabs) still ding on Stop.

## lazygit
`mkdir -p ~/.config/lazygit && cp lazygit/config.yml ~/.config/lazygit/config.yml`
