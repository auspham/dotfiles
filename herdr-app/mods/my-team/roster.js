// Which agents share a herdr space, and what to show for each. Pure: no herdr imports, so node can test it.

const ORDER = { blocked: 0, working: 1, idle: 2, done: 3 };

/** Live Claude sessions by id, from the texts of ~/.claude/sessions/*.json. Unreadable entries are skipped. */
export function parseSessions(texts) {
  const sessions = new Map();
  for (const text of texts) {
    try {
      const entry = JSON.parse(text);
      if (entry?.sessionId) sessions.set(entry.sessionId, { name: entry.name ?? null, busy: entry.status === "busy", socket: entry.messagingSocketPath ?? null });
    } catch {
      // A file caught half written is picked up on the next refresh.
    }
  }
  return sessions;
}

// herdr reports the program in different fields depending on the call, so any of them may say it is Claude.
const isClaude = (t) => [t.app, t.agent, t.status?.app, t.program?.key].some((v) => v === "claude-code" || v === "claude");

/**
 * The session name a SendMessage target stands for. A target is a name, or a socket address such as
 * `uds:/run/user/1000/cc-socks/123.sock`; an address that no live session owns reads "a closed session".
 */
export function resolveTarget(to, sessions) {
  if (!to.startsWith("uds:")) return to;
  const socket = to.slice(4);
  for (const session of sessions.values()) if (session.socket === socket) return session.name ?? to;
  return "a closed session";
}

const folderOf = (terminal) => (terminal.foreground?.cwd ?? terminal.cwd ?? "").split("/").filter(Boolean).pop() ?? "";

/** The name other agents use for this one: its session name, else a short session id, else its title. */
export const displayName = (terminal, sessions) => {
  const id = terminal.labels?.["claude.session"];
  return sessions.get(id)?.name ?? (id ? id.slice(0, 6) : null) ?? (terminal.title || terminal.address);
};

// Within a group, agents needing attention come first.
const byAttention = (a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.address.localeCompare(b.address);

function toCard(t, sessions) {
  return {
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
    role: t.labels?.role ?? "",
    coord: t.labels?.coord ?? "",
    owner: t.labels?.owner ?? "",
    task: t.labels?.task ?? "",
    branch: t.labels?.branch ?? "",
    review: t.labels?.review ?? "",
    reviewNote: t.labels?.review_note ?? "",
    coordName: "",
    ownerName: "",
  };
}

/**
 * The cards in groups: each coordinator followed by the children it controls now, then everyone else.
 * A grouped child carries its coordinator's name, and a lent child its owner's name, for the view to show.
 */
export function groupCards(cards) {
  const sorted = [...cards].sort(byAttention);
  const names = new Map(sorted.map((c) => [c.address, c.name]));
  const leads = sorted.filter((c) => c.role === "coordinator");
  const placed = new Set(leads.map((c) => c.address));
  const groups = leads.flatMap((lead) => {
    const kids = sorted.filter((c) => c.role === "child" && c.coord === lead.address);
    kids.forEach((c) => placed.add(c.address));
    const named = kids.map((c) => ({ ...c, coordName: lead.name, ownerName: c.owner ? (names.get(c.owner) ?? c.owner) : "" }));
    return [lead, ...named];
  });
  return [...groups, ...sorted.filter((c) => !placed.has(c.address))];
}

/** One card per Claude agent in the space, grouped by coordinator, those needing attention first in each group. */
export function teamCards({ terminals, sessions, spaceId }) {
  const live = terminals.filter((t) => isClaude(t) && t.labels?.["herdr.space"] === spaceId && t.state !== "finished");
  return groupCards(live.map((t) => toCard(t, sessions)));
}

/** The space's name from a terminal's "space / tab" label, for the pane heading. */
export const spaceName = (terminals, spaceId) =>
  (terminals.find((t) => t.labels?.["herdr.space"] === spaceId)?.labels?.where ?? "").split(" / ")[0];

/** The one line under the heading, such as "2 working, 1 ready for review, 1 waiting for you", or "" when no child exists. */
export function childSummary(cards) {
  const children = cards.filter((c) => c.role === "child");
  if (!children.length) return "";
  const reviewing = children.filter((c) => c.review === "reviewing").length;
  const working = children.filter((c) => c.status === "working" && c.review !== "reviewing").length;
  const ready = children.filter((c) => c.status !== "working" && c.review === "pending").length;
  const waiting = children.filter((c) => c.review === "yours").length;
  const done = children.filter((c) => c.review === "reviewed").length;
  return [working && `${working} working`, reviewing && `${reviewing} in review`, ready && `${ready} ready for review`, waiting && `${waiting} waiting for you`, done && `${done} reviewed by you`].filter(Boolean).join(", ") || `${children.length} child${children.length === 1 ? "" : "ren"}, nothing waiting`;
}
