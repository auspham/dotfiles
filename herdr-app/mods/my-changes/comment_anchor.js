// Where a comment thread sits in a diff: the anchored lines' text plus a little context, so it can be found again after the diff changes. Pure: no herdr imports, so node can test it.

const CONTEXT = 3;

/** @typedef {{ kind: string, number?: number, text: string }} Row a unified diff row from diffRows */
/** @typedef {{ side: "old" | "new", n: number, text: string }} AnchorLine */
/** @typedef {{ lines: AnchorLine[], before: string[], after: string[] }} Anchor */
/** @typedef {{ from: number, to: number }} Span unified row indices, inclusive */

const isLine = (r) => Boolean(r) && (r.kind === "+" || r.kind === "-" || r.kind === " ");
const sideOf = (r) => (r.kind === "-" ? "old" : "new");
const texts = (rows) => rows.filter(isLine).map((r) => r.text);

/** The anchor for unified rows `from`..`to`, or null when they hold no code line. @param {Row[]} rows @param {number} from @param {number} to @returns {Anchor | null} */
export function makeAnchor(rows, from, to) {
  const lines = rows.slice(from, to + 1).filter(isLine).map((r) => ({ side: sideOf(r), n: r.number ?? 0, text: r.text }));
  if (!lines.length) return null;
  return { lines, before: texts(rows.slice(Math.max(0, from - CONTEXT), from)), after: texts(rows.slice(to + 1, to + 1 + CONTEXT)) };
}

/** How well the code lines at positions `p`.. of `index` fit the anchor, or null when their text differs. */
function score(anchor, rows, index, p) {
  const { lines } = anchor;
  for (let k = 0; k < lines.length; k++) {
    const r = rows[index[p + k]];
    if (!r || r.text !== lines[k].text || sideOf(r) !== lines[k].side) return null;
  }
  const at = (q) => rows[index[q]]?.text;
  let s = rows[index[p]].number === lines[0].n ? 100 : 0;
  anchor.before.forEach((text, k) => { if (at(p - anchor.before.length + k) === text) s += 10; });
  anchor.after.forEach((text, k) => { if (at(p + lines.length + k) === text) s += 10; });
  // Among equal fits, the one nearest the old line number wins.
  return s - Math.min(9, Math.abs((rows[index[p]].number ?? 0) - lines[0].n) / 100);
}

/** Finds the anchored lines in a new diff: the same text in the same order, best fitting the old number and context. Null when the text is gone, so the thread shows as outdated. @param {Anchor} anchor @param {Row[]} rows @returns {Span | null} */
export function locate(anchor, rows) {
  const index = [];
  rows.forEach((r, i) => { if (isLine(r)) index.push(i); });
  let best = null, bestScore = -Infinity;
  for (let p = 0; p + anchor.lines.length <= index.length; p++) {
    const s = score(anchor, rows, index, p);
    if (s !== null && s > bestScore) { bestScore = s; best = p; }
  }
  return best === null ? null : { from: index[best], to: index[best + anchor.lines.length - 1] };
}

/** The unified rows a split row draws. pairRows reuses the unified row objects, except a context row's left copy, so identity maps them back. */
const sources = (row) => (row.kind === "pair" ? [row.left, row.right] : [row]).filter(Boolean);

/** Maps a selection of split rows to the unified span it covers, or null. @param {any[]} split @param {Row[]} rows @param {number} from @param {number} to @returns {Span | null} */
export function toUnified(split, rows, from, to) {
  const at = new Map(rows.map((r, i) => [r, i]));
  const hits = split.slice(Math.min(from, to), Math.max(from, to) + 1).flatMap(sources).map((r) => at.get(r)).filter((i) => i !== undefined);
  return hits.length ? { from: Math.min(...hits), to: Math.max(...hits) } : null;
}

/** For each split row, the unified indices it draws; used to place threads and markers in split mode. @param {any[]} split @param {Row[]} rows @returns {number[][]} */
export function splitSources(split, rows) {
  const at = new Map(rows.map((r, i) => [r, i]));
  return split.map((row) => sources(row).map((r) => at.get(r)).filter((i) => i !== undefined));
}

/** The line numbers a reader would quote for an anchor: its new lines, or the removed ones when it has none. @param {Anchor} anchor */
export function quotedLines(anchor) {
  const fresh = anchor.lines.filter((l) => l.side === "new").map((l) => l.n);
  return fresh.length ? fresh : anchor.lines.map((l) => l.n);
}

/** "line 12", "lines 12-14", or "removed lines 3-4" for an anchor, as a reader would quote it. @param {Anchor} anchor */
export function anchorLabel(anchor) {
  const list = quotedLines(anchor), removed = !anchor.lines.some((l) => l.side === "new");
  const lo = Math.min(...list), hi = Math.max(...list), many = lo !== hi;
  return `${removed ? "removed " : ""}line${many ? "s" : ""} ${many ? `${lo}-${hi}` : lo}`;
}

/** The anchored lines as diff text, with the numbers a reader would quote. @param {Anchor} anchor */
export const anchorText = (anchor) => anchor.lines.map((l) => `${l.side === "old" ? "-" : "+"} ${String(l.n).padStart(4)} | ${l.text}`).join("\n");

/** An anchor read back from storage or shared state, or null unless every field has the right type. @param {unknown} v @returns {Anchor | null} */
export function parseAnchor(v) {
  const a = /** @type {any} */ (v);
  if (!a || typeof a !== "object" || !Array.isArray(a.lines) || !a.lines.length || a.lines.length > 400) return null;
  const okLine = (l) => l && (l.side === "old" || l.side === "new") && Number.isInteger(l.n) && typeof l.text === "string";
  const okTexts = (list) => Array.isArray(list) && list.length <= CONTEXT && list.every((s) => typeof s === "string");
  if (!a.lines.every(okLine) || !okTexts(a.before) || !okTexts(a.after)) return null;
  return { lines: a.lines.map(({ side, n, text }) => ({ side, n, text })), before: [...a.before], after: [...a.after] };
}
