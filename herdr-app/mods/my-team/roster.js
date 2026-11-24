// Which agents share a herdr space, and what to show for each. Pure: no herdr imports, so node can test it.

const ORDER = { blocked: 0, working: 1, idle: 2, done: 3 };

/** Live Claude sessions by id, from the texts of ~/.claude/sessions/*.json. Unreadable entries are skipped. */
export function parseSessions(texts) {
  const sessions = new Map();
  for (const text of texts) {
    try {
      const entry = JSON.parse(text);
      if (entry?.sessionId) sessions.set(entry.sessionId, { name: entry.name ?? null, busy: entry.status === "busy" });
    } catch {
      // A file caught half written is picked up on the next refresh.
    }
  }
  return sessions;
}

// herdr reports the program in different fields depending on the call, so any of them may say it is Claude.
const isClaude = (t) => [t.app, t.agent, t.status?.app, t.program?.key].some((v) => v === "claude-code" || v === "claude");

const folderOf = (terminal) => (terminal.foreground?.cwd ?? terminal.cwd ?? "").split("/").filter(Boolean).pop() ?? "";

/** The name other agents use for this one: its session name, else a short session id, else its title. */
export const displayName = (terminal, sessions) => {
  const id = terminal.labels?.["claude.session"];
  return sessions.get(id)?.name ?? (id ? id.slice(0, 6) : null) ?? (terminal.title || terminal.address);
};

/** One card per Claude agent in the space, those needing attention first. */
export function teamCards({ terminals, sessions, spaceId }) {
  return terminals
    .filter((t) => isClaude(t) && t.labels?.["herdr.space"] === spaceId && t.state !== "finished")
    .map((t) => ({
      address: t.address,
      session: t.labels?.["claude.session"] ?? null,
      name: displayName(t, sessions),
      label: t.title?.trim() || displayName(t, sessions),
      status: typeof t.status === "string" ? t.status : (t.status?.state ?? "idle"),
      title: t.title || "",
      folder: folderOf(t),
      where: t.labels?.where ?? "",
      turn: t.turn ?? 0,
      question: t.report?.msg ?? "",
    }))
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.address.localeCompare(b.address));
}

/** The space's name from a terminal's "space / tab" label, for the pane heading. */
export const spaceName = (terminals, spaceId) =>
  (terminals.find((t) => t.labels?.["herdr.space"] === spaceId)?.labels?.where ?? "").split(" / ")[0];
