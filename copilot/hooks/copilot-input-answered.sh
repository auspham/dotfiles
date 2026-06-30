#!/usr/bin/env bash
# PostToolUse hook: resume the working spinner once the agent's wait resolves -
# either an input tool just completed (AskUserQuestion / exit_plan_mode) or the
# window is still stuck in "input" while a non-input tool runs.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
if hook_is_input_tool || [ "$(hook_state_read)" = input ]; then
  hook_start_working "$(hook_session_name)"
fi
exit 0
