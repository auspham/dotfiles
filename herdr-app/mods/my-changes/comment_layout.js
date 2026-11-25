// What an inline thread draws, line by line, and where threads sit among the diff rows. The virtual list places rows by heights the script states, so a thread's text is wrapped here and its height follows from its line count. Pure: no herdr imports, so node can test it.

import { waiting, isDraft } from "./comment_threads.js";
import { anchorLabel, locate } from "./comment_anchor.js";
import { threadChip } from "./comment_status.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {"head" | "you" | "who" | "body" | "error" | "hint" | "gap" | "marker" | "add"} Tone */
/** @typedef {{ text: string, tone: Tone, chip?: import("./comment_status.js").Chip }} Line */
/** @typedef {{ after: number, key: string, h: number, thread?: Thread }} Block after: the row it sits under, -1 for the top */
/** @typedef {{ row: number } | { block: Block }} Item */

// A block's vertical px beyond its lines: outer padding 2x5, card border 2x1, inner padding 2x4. comment_view.js draws exactly these.
export const BLOCK_PAD = 20, GAP_H = 6;
// A long answer is cut here inline; its full text stays in the store.
export const MAX_ANSWER_LINES = 14;

/** Word-wraps plain text to `cols` columns, breaking long words. @param {string} text @param {number} cols @returns {string[]} */
export function wrapText(text, cols) {
  const width = Math.max(8, cols), out = [];
  for (const para of text.replace(/\t/g, "    ").split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      let w = word;
      if (line && (line + " " + w).length > width) { out.push(line); line = ""; }
      while (w.length > width) { out.push(w.slice(0, width)); w = w.slice(width); }
      line = line ? `${line} ${w}` : w;
    }
    out.push(line);
  }
  return out;
}

/** @param {string} text @param {number} cols @param {Tone} tone @param {number} [max] @returns {Line[]} */
function wrapped(text, cols, tone, max = Infinity) {
  const lines = wrapText(text, cols);
  const kept = lines.length > max ? [...lines.slice(0, max - 1), `… ${lines.length - max + 1} more lines`] : lines;
  return kept.map((s) => ({ text: s, tone }));
}

/** The answer lines under a comment; a queued or waiting one has none, since the header's chip says so. @param {import("./comment_threads.js").Exchange} e @param {number} cols @returns {Line[]} */
function answerLines(e, cols) {
  if (e.status === "done") return [{ text: e.to?.name ?? "Claude", tone: "who" }, ...wrapped(e.a, cols, "body", MAX_ANSWER_LINES)];
  if (e.status === "error") return wrapped(e.a, cols, "error", MAX_ANSWER_LINES);
  if (e.status === "draft" && e.a) return wrapped(`${e.a} Send all tries again.`, cols, "error");
  return [];
}

/** "Line 3" or "Lines 6-9". @param {Thread} t */
const where = (t) => anchorLabel(t.anchor).replace(/^l/, "L");

/** @param {number} n */
const replies = (n) => `${n} repl${n === 1 ? "y" : "ies"}`;

/** The one line a resolved or collapsed thread shrinks to. @param {Thread} t */
function markerText(t) {
  const first = t.exchanges[0].q.split("\n")[0];
  if (t.resolved) return `✓ Resolved · ${where(t)} · ${first}`;
  return `▸ ${where(t)} · ${replies(t.exchanges.filter((e) => e.status === "done").length)} · ${first}`;
}

/** @param {Thread} t */
const hintOf = (t) => (isDraft(t) ? "Click to edit or delete" : waiting(t) ? "Click to collapse or delete" : "Click to reply or resolve");

/** The text lines an inline thread draws at `cols` columns; the header carries the status chip. @param {Thread} t @param {number} cols @param {{ collapsed: boolean, outdated: boolean }} state @returns {Line[]} */
export function threadLines(t, cols, { collapsed, outdated }) {
  const fit = (text) => text.slice(0, Math.max(8, cols));
  if (t.resolved || collapsed) return [{ text: fit(markerText(t)), tone: "marker" }];
  /** @type {Line[]} */
  const out = [{ text: fit(outdated ? `${where(t)}, no longer in this diff` : where(t)), tone: "head", chip: threadChip(t) }];
  t.exchanges.forEach((e, i) => {
    if (i > 0) out.push({ text: "", tone: "gap" });
    out.push({ text: "You", tone: "you" }, ...wrapped(e.q, cols, "body"), ...answerLines(e, cols));
  });
  out.push({ text: hintOf(t), tone: "hint" });
  return out;
}

/** A line's height in px; a gap between exchanges is a short spacer. @param {Line} l @param {number} lineH */
export const lineHeight = (l, lineH) => (l.tone === "gap" ? GAP_H : lineH);

/** A block's height in px for its lines. @param {Line[]} lines @param {number} lineH */
export const blockHeight = (lines, lineH) => lines.reduce((h, l) => h + lineHeight(l, lineH), BLOCK_PAD);

/** How many characters of thread text fit in a block `width` px wide. @param {number} width @param {number} charW @param {number} inset px taken by the block's margin, rail and padding */
export const blockCols = (width, charW, inset) => Math.max(8, Math.floor((width - inset) / charW));

/** The diff rows with the blocks placed under the rows they follow, and every item's height for the virtual list. @param {number} count rows @param {number | number[]} rowH one height for all rows, or one per row @param {Block[]} blocks @returns {{ items: Item[], heights: number[] }} */
export function layoutItems(count, rowH, blocks) {
  const by = new Map();
  for (const b of blocks) by.set(b.after, [...(by.get(b.after) ?? []), b]);
  const items = [], heights = [];
  const put = (list) => { for (const b of list ?? []) { items.push({ block: b }); heights.push(b.h); } };
  put(by.get(-1));
  for (let i = 0; i < count; i++) {
    items.push({ row: i }); heights.push(typeof rowH === "number" ? rowH : rowH[i]);
    put(by.get(i));
  }
  return { items, heights };
}

/** Where each thread sits in the rows on screen: under its last anchored row, or at the top as outdated when its lines are gone. Also the rows to mark in the gutter. In split mode `splitSrc` maps each split row to the unified rows it draws. @param {Thread[]} threads @param {any[]} rows unified rows @param {number[][] | null} splitSrc @returns {{ placed: { thread: Thread, after: number }[], outdated: Thread[], marked: Set<number> }} */
export function placeThreads(threads, rows, splitSrc) {
  const placed = [], outdated = [], marked = new Set();
  const toShown = (i) => (splitSrc ? splitSrc.findIndex((src) => src.includes(i)) : i);
  for (const thread of threads) {
    const span = locate(thread.anchor, rows);
    if (!span) { outdated.push(thread); continue; }
    const shown = [];
    for (let i = span.from; i <= span.to; i++) if (rows[i]?.kind !== "@") shown.push(toShown(i));
    shown.filter((i) => i >= 0).forEach((i) => marked.add(i));
    placed.push({ thread, after: Math.max(...shown, -1) });
  }
  return { placed, outdated, marked };
}
