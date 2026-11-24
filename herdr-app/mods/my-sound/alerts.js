// What an agent's status change should sound like. Pure: no herdr imports, so node can test it.

const FINISHED = new Set(["done", "idle"]);

/**
 * The alert for an agent whose status went from `before` to `now`, or null for none.
 * A child agent launched by a coordinator stays quiet when it finishes, because only the coordinator
 * needs to know; it still alerts when blocked, since nobody but the user can answer a permission prompt.
 */
export function alertFor(before, now, role) {
  if (before !== "blocked" && now === "blocked") return { sound: "blocked", level: "warning", verb: "needs you" };
  if (before === "working" && FINISHED.has(now) && role !== "child") return { sound: "done", level: "success", verb: "finished" };
  return null;
}
