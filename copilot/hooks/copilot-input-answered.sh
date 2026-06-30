#!/usr/bin/env bash
# PostToolUse hook: the agent's wait resolved (AskUserQuestion / exit_plan_mode) ->
# resume the working spinner. No-op for every other tool.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_in_tmux || exit 0
hook_is_input_tool || exit 0
hook_start_working "$(hook_session_name)"
exit 0
