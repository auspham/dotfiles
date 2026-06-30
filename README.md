Simply:


`cp -r nvim ~/.config/nvim`
`cp -r neovide ~/.config/neovide`


Download JetbrainsMono Nerd Font

## Copilot CLI
`cp copilot/settings.json copilot/copilot-instructions.md ~/.copilot/`
`mkdir -p ~/.copilot/hooks && cp copilot/hooks/*.sh ~/.copilot/hooks/ && chmod +x ~/.copilot/hooks/*.sh`
Hooks (share `hooks/lib.sh`): completion ding + ✓ green window named after the session (Stop); clear marker on next prompt (UserPromptSubmit); `bell` sound + yellow `(?)` when input is needed, fired by the Notification hook and a PreToolUse hook matching the input tools `AskUserQuestion` (ask_user) and `exit_plan_mode` (plan ready for review); a matching PostToolUse hook clears the `(?)` as soon as the answer/plan is resolved. Sounds are centralised in `lib.sh` (`hook_sound_input`, `hook_sound_done`). For debugging, `touch ~/.copilot/hooks/.debug` to log raw hook payloads to `hooks/debug.log` (`rm` the sentinel to stop).

## lazygit
`mkdir -p ~/.config/lazygit && cp lazygit/config.yml ~/.config/lazygit/config.yml`
