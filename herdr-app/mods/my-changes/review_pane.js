// Which pane shows the Changes diff in the main area, and what the side panel tells it. Pure: no herdr imports, so node can test it.

export const REVIEW_MOD = "my-changes";
export const TOGGLE_KEY = "review.toggle";
// A Mark reviewed request older than this is left alone: shared values outlive a restart.
export const TOGGLE_TTL_MS = 15000;

/** @typedef {{ pane: string, tab: string, mod?: string, terminal?: string | null }} PaneRow */
/** @typedef {{ path: string, status: string, fresh: boolean, binary: boolean, add: number, del: number, hash: string | null }} RecordFile */
/** @typedef {{ tab: string, root: string, on: string | null, against: string, hasHead: boolean, file: RecordFile, reviewed: boolean, stale: boolean }} ReviewRecord */

/** The shared key that carries one tab's open file, so each tab's pane shows its own. @param {string} tab */
export const reviewKey = (tab) => `review.open.${tab}`;

/** The review pane already open in `tab`, or null. @param {PaneRow[]} panes @param {string | null | undefined} tab @returns {string | null} */
export function findReviewPane(panes, tab) {
  return panes.find((p) => p.tab === tab && p.mod === REVIEW_MOD)?.pane ?? null;
}

/** The terminal pane to split for a new review pane, or null when focus is not on one (a layout block or a mod pane), so the diff stays in the side panel. @param {{ pane: string | null } | null} focus @param {PaneRow[]} panes @returns {string | null} */
export function splitTarget(focus, panes) {
  if (!focus?.pane) return null;
  const row = panes.find((p) => p.pane === focus.pane);
  return row?.terminal ? row.pane : null;
}

/** What the side panel follows from focus (its folder, or the terminal whose guide it shows). The review pane has neither, so while it has focus the panel keeps the last value instead of jumping to the space's folder or dropping the guide. @template L @param {PaneRow | null | undefined} focusedPane @param {L} fresh @param {L | null} last @returns {L} */
export function followFocus(focusedPane, fresh, last) {
  return focusedPane?.mod === REVIEW_MOD && last ? last : fresh;
}

/** What the side panel publishes for its open file. @returns {ReviewRecord} */
export function reviewRecord({ tab, root, on, against, hasHead, file, reviewed, stale }) {
  const { path, status, fresh, binary, add, del, hash } = file;
  return { tab, root, on: on ?? null, against, hasHead: Boolean(hasHead), file: { path, status, fresh: Boolean(fresh), binary: Boolean(binary), add, del, hash: hash ?? null }, reviewed, stale };
}

const isText = (v) => typeof v === "string" && v.length > 0;
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isFile = (f) => Boolean(f) && isText(f.path) && isText(f.status) && typeof f.fresh === "boolean" && typeof f.binary === "boolean" && isCount(f.add) && isCount(f.del) && (f.hash === null || typeof f.hash === "string");

/** A record read back from shared state, or null unless every field has the right type; shared values persist, so they may be old or foreign. @param {unknown} v @returns {ReviewRecord | null} */
export function parseRecord(v) {
  if (!v || typeof v !== "object") return null;
  const r = /** @type {any} */ (v);
  const ok = isText(r.tab) && isText(r.root) && (r.on === null || typeof r.on === "string") && isText(r.against)
    && typeof r.hasHead === "boolean" && typeof r.reviewed === "boolean" && typeof r.stale === "boolean" && isFile(r.file);
  return ok ? reviewRecord(r) : null;
}

/** How the pane takes a new record: "open" a file afresh, reload its "content" in place (an edit, so the view keeps its place), redraw only its "marks", or null when nothing changed. @param {ReviewRecord | null} prev @param {ReviewRecord} next @returns {"open" | "content" | "marks" | null} */
export function reviewChange(prev, next) {
  if (!prev) return "open";
  const same = ["root", "on", "against", "hasHead"].every((k) => prev[k] === next[k]);
  if (!same || prev.file.path !== next.file.path) return "open";
  // The panel publishes on a click before its load, then again with the hash; the pane's own load already has that text.
  if (prev.file.hash !== null && prev.file.hash !== next.file.hash) return "content";
  return JSON.stringify(prev) === JSON.stringify(next) ? null : "marks";
}

/** What to do with a request in shared state that names a path (Mark reviewed, or a jump from the comment list): the path to act on (or null) and the request to remember as handled. @param {unknown} req @param {number | null} seen @param {string | null} root @param {number} now @returns {{ path: string | null, seen: number | null }} */
export function toggleToApply(req, seen, root, now) {
  const r = /** @type {any} */ (req);
  if (!r || typeof r !== "object" || !Number.isFinite(r.ts) || r.ts === seen) return { path: null, seen };
  const fresh = now - r.ts <= TOGGLE_TTL_MS && Boolean(root) && r.root === root && isText(r.path);
  return { path: fresh ? r.path : null, seen: r.ts };
}
