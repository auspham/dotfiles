# Coordinator knowledge: private, local only

This folder (`~/.claude/coordinator/`, or `$COORDINATOR_HOME`) holds what herdr coordinators know about this machine's work:

- `preferences.md`: what the user likes about how work is done.
- `spaces/<space-id>/notes.md`: the topic notes shared by the coordinators of one herdr space: its goal, one workstream line per coordinator, decisions and open questions.
- `spaces/<space-id>/coordinators/<name>.md`: one coordinator's own plan, children and next step (named after its session, or its terminal address when unnamed).
- `spaces/<space-id>/ledger.jsonl`: every child spawned, reviewed, handed off, killed, adopted, lent or returned, with full task text and review notes.

It names private repos, branches, tasks and decisions, so it never leaves this machine:

- Never commit it, copy it into a repository, or push it anywhere, including the dotfiles repo. Only `claude/coordinator/preferences.example.md` and this file are committed.
- Never paste it into an external service (issues, pull requests, chat, docs, gists, artifacts) unless the user explicitly asks for that specific content.
- When a task needs facts from it, read them and quote only the lines needed, in your local reply to the user.
- Any coordinator of a space edits its own Workstreams line and the Decisions and Open questions in that space's `notes.md`, in small edits, and only its own `coordinators/<name>.md`. Other agents only read them. Never edit `ledger.jsonl`: hcoord appends it.
