#!/usr/bin/env bash
# UserPromptSubmit hook: clear marker/style, restore plain session name.
source "$HOME/.copilot/hooks/lib.sh"
hook_read_input
hook_mark "" "-" "$(hook_session_name)"
exit 0
