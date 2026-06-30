Simply:


`cp -r nvim ~/.config/nvim`
`cp -r neovide ~/.config/neovide`


Download JetbrainsMono Nerd Font

## Copilot CLI
`cp copilot/settings.json copilot/copilot-instructions.md ~/.copilot/`
`mkdir -p ~/.copilot/hooks && cp copilot/hooks/*.sh ~/.copilot/hooks/ && chmod +x ~/.copilot/hooks/*.sh`
Hooks (share `hooks/lib.sh`): completion ding + ✓ green window named after the session (Stop); clear marker on next prompt (UserPromptSubmit); question sound + yellow ❓ when input is needed, fired by the Notification hook and a PreToolUse hook matching tool_name `AskUserQuestion`.

## lazygit
`mkdir -p ~/.config/lazygit && cp lazygit/config.yml ~/.config/lazygit/config.yml`
