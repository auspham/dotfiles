# Coordinator knowledge: private, local only

This folder (`~/.claude/coordinator/`, or `$COORDINATOR_HOME`) holds what herdr coordinators know about this machine's work:

- `preferences.md`: what the user likes about how work is done.
- `spaces/<space-id>/notes.md`: a coordinator's goal, plan, children, decisions and next step for one herdr space.
- `spaces/<space-id>/ledger.jsonl`: every child spawned, reviewed, killed or adopted, with full task text and review notes.

It names private repos, branches, tasks and decisions, so it never leaves this machine:

- Never commit it, copy it into a repository, or push it anywhere, including the dotfiles repo. Only `claude/coordinator/preferences.example.md` and this file are committed.
- Never paste it into an external service (issues, pull requests, chat, docs, gists, artifacts) unless the user explicitly asks for that specific content.
- When a task needs facts from it, read them and quote only the lines needed, in your local reply to the user.
- Write `notes.md` only if you are the coordinator of that space. Never edit `ledger.jsonl`: hcoord appends it.
