// What the Team panel knows about the focused space from the coordinator's knowledge space. Pure, so node can test it.

const NOTES_CAP = 4000;
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/**
 * @typedef {{ name: string, event: string, killed: boolean, verdict: string, note: string, branch: string, task: string, controller: string, owner: string }} Child
 */

/** The folder for a space under the coordinator's knowledge space, or null when the id could escape it. */
export const spaceDir = (home, spaceId) =>
  home && typeof spaceId === "string" && SAFE_ID.test(spaceId) && spaceId !== ".." && spaceId !== "." ? `${home}/.claude/coordinator/spaces/${spaceId}` : null;

/** The notes as shown: the first NOTES_CAP characters, or null when there are none. */
export function capNotes(text) {
  const body = (text ?? "").trim();
  if (!body) return null;
  return body.length > NOTES_CAP ? `${body.slice(0, NOTES_CAP)}…` : body;
}

function parseLine(line) {
  try {
    const entry = JSON.parse(line);
    return entry && typeof entry.name === "string" && typeof entry.event === "string" ? entry : null;
  } catch {
    return null;
  }
}

// The ledger rule for control: the latest of these events decides the controller, and only a lend leaves an owner.
const CONTROL = {
  spawn: (e) => ({ controller: e.coord ?? "", owner: "" }),
  adopt: (e) => ({ controller: e.coord ?? "", owner: "" }),
  lend: (e) => ({ controller: e.to ?? "", owner: e.from ?? e.coord ?? "" }),
  return: (e) => ({ controller: e.to ?? "", owner: "" }),
};

/**
 * One entry per child in the ledger text (JSON lines), folded to its latest state, in order of first appearance.
 * A line that is not valid JSON is skipped.
 * @param {string} text
 * @returns {Child[]}
 */
export function foldLedger(text) {
  const children = new Map();
  for (const entry of (text ?? "").split("\n").map(parseLine).filter(Boolean)) {
    const prev = entry.event === "spawn" ? null : children.get(entry.name);
    const child = prev ?? { name: entry.name, verdict: "", note: "", branch: "", task: "", controller: "", owner: "" };
    if (entry.event === "spawn") Object.assign(child, { branch: entry.branch ?? "", task: entry.task ?? "" });
    if (Object.hasOwn(CONTROL, entry.event)) Object.assign(child, CONTROL[entry.event](entry));
    if (entry.event === "review") Object.assign(child, { verdict: entry.verdict ?? "", note: entry.note ?? "" });
    children.set(entry.name, { ...child, event: entry.event, killed: entry.event === "kill" });
  }
  return [...children.values()];
}

/** The header count, such as "3 children, 1 killed", or "" when there is no ledger. */
export function ledgerSummary(children) {
  if (!children) return "";
  const killed = children.filter((c) => c.killed).length;
  return `${children.length} ${children.length === 1 ? "child" : "children"}${killed ? `, ${killed} killed` : ""}`;
}

/** Who controls a child now, such as "coord t2, lent by t1", by coordinator terminal. */
export const controllerText = (c) => `coord ${c.controller}${c.owner ? `, lent by ${c.owner}` : ""}`;
