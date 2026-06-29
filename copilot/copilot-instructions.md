# Personal Copilot CLI Instructions

## Path shortcuts
When I use a `!Name` token in my message, treat it as shorthand for the corresponding absolute path below. Expand it transparently for any tool calls (view, grep, glob, bash, etc.).

| Shortcut | Expands to |
| --- | --- |
| `!PhynetTSG` | `/home/austin/projects/PhynetTSG` |
| `!vault` | `/home/austin/ms-notes` |

## tmux window targeting

When I include a token of the form `<window>` or `<window:pane>` in my message, run the request's shell commands inside that tmux window/pane in **my current tmux session** so I can watch them live, instead of using the `bash` tool's hidden shell.

**Resolving the target**
1. Detect Copilot CLI's own tmux session: `tmux display-message -p '#S'`. Call it `$SELF`.
2. Pick `$SESSION` (the session to send commands into) as follows:
   - List attached sessions: `tmux list-sessions -F '#{session_name} #{session_attached}'`.
   - Prefer the **attached session that is NOT `$SELF`**. This is the session I'm watching from.
   - If exactly one such session exists, use it.
   - If none exist, fall back to `$SELF`.
   - If more than one exists, tell me and ask which to use.
3. `<window>` → target `$SESSION:window` (active pane of that window).
4. `<window:pane>` → target `$SESSION:window.pane` (pane index `pane` in that window).
5. If the window does not exist in `$SESSION`, create it first: `tmux new-window -t "$SESSION" -n window -d`. Don't switch my active window.
6. If I'm not inside any tmux session (`tmux display-message` fails / no `$TMUX`), tell me and fall back to the normal `bash` tool.

One-liner to resolve `$SESSION`:
```bash
SELF=$(tmux display-message -p '#S')
SESSION=$(tmux list-sessions -F '#{session_name} #{session_attached}' \
          | awk -v s="$SELF" '$2>0 && $1!=s {print $1}' | head -1)
SESSION=${SESSION:-$SELF}
```

**Executing a command in the target**
Use the `bash` tool to drive `tmux`, not to run the command directly:

```bash
SELF=$(tmux display-message -p '#S')
SESSION=$(tmux list-sessions -F '#{session_name} #{session_attached}' \
          | awk -v s="$SELF" '$2>0 && $1!=s {print $1}' | head -1)
SESSION=${SESSION:-$SELF}
TARGET="$SESSION:build"           # $SESSION:window  or  $SESSION:window.pane
tmux list-windows -t "$SESSION" -F '#W' | grep -qx build \
  || tmux new-window -t "$SESSION" -n build -d
tmux send-keys -t "$TARGET" -l -- 'the exact command to run'
tmux send-keys -t "$TARGET" Enter
sleep 1
tmux capture-pane -t "$TARGET" -p -S -200 | tail -80
```

**Rules**
- Always split the command and `Enter` into two `send-keys` calls (per the tmux skill).
- After sending, capture the pane and include the relevant tail in your reply so I get the output here too.
- For long-running / interactive processes (servers, watchers, REPLs), don't wait for completion — send the command, capture once to confirm it started, then proceed. Re-capture later if I ask for status.
- The `<...>` token applies to every shell command for that request unless I tag individual commands differently. Commands that are purely about inspecting tmux itself (`tmux ls`, `capture-pane`, etc.) still go through the normal `bash` tool.
- Built-in tools (`view`, `grep`, `glob`, `edit`, etc.) are unaffected — only shell commands are redirected.

**Examples**
- `run the test suite <build>` → send `pytest ...` to window `build` in the current session, creating it if missing.
- `tail the log <logs:1>` → send `tail -f ...` to pane 1 of window `logs` in the current session.
