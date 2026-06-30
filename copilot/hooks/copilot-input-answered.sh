#!/usr/bin/env bash
# PostToolUse hook: once the agent's wait resolves (AskUserQuestion / exit_plan_mode),
# clear the (?) mark and restore the plain working window. No-op for every other tool.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_is_input_tool || exit 0
hook_mark "" "-" "$(hook_session_name)"
exit 0
