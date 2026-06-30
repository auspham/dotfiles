#!/usr/bin/env bash
# UserPromptSubmit hook: agent starts working -> animated spinner on the window.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_debug
hook_start_working "$(hook_session_name)"
exit 0
