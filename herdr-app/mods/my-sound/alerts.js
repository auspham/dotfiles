// What an agent's status change should sound like. Pure: no herdr imports, so node can test it.

const FINISHED = new Set(["done", "idle"]);

/**
 * The alert for an agent whose status went from `before` to `now`, or null for none.
 * A child agent launched by a coordinator stays quiet when it finishes, because only the coordinator
 * needs to know; it still alerts when blocked, since nobody but the user can answer a permission prompt.
 * @param {{ before?: string, now: string, role?: string }} change
 */
export function alertFor({ before, now, role }) {
  if (before !== "blocked" && now === "blocked") return { sound: "blocked", level: "warning", verb: "needs you" };
  if (before === "working" && FINISHED.has(now) && role !== "child") return { sound: "done", level: "success", verb: "finished" };
  return null;
}

/**
 * The archived space ids in my-spaces' archive file text. A missing or damaged file archives nothing.
 * @param {string | null | undefined} text
 * @returns {Set<string>}
 */
export function parseArchived(text) {
  try {
    const spaces = JSON.parse(text ?? "")?.spaces;
    return new Set(Array.isArray(spaces) ? spaces.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Whether an agent's alert is dropped: agents in an archived space are quiet for done and for blocked.
 * @param {string} space the agent's space id
 * @param {Set<string>} archived
 * @returns {boolean}
 */
export const isQuiet = (space, archived) => archived.has(space);
