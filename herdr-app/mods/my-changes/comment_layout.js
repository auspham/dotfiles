// What an inline thread draws, line by line, and where threads sit among the diff rows. The virtual list places rows by heights the script states, so a thread's text is wrapped here and its height follows from its line count. Pure: no herdr imports, so node can test it.

import { waiting, isDraft } from "./comment_threads.js";
import { anchorLabel, locate } from "./comment_anchor.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {"head" | "you" | "who" | "answer" | "wait" | "error" | "hint"} Tone */
/** @typedef {{ text: string, tone: Tone }} Line */
/** @typedef {{ after: number, key: string, h: number, thread?: Thread }} Block after: the row it sits under, -1 for the top */
/** @typedef {{ row: number } | { block: Block }} Item */

export const BLOCK_PAD = 10;
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

/** @param {import("./comment_threads.js").Exchange} e @returns {[string, Tone]} */
function answerOf(e) {
  if (e.status === "draft") return e.a ? [`${e.a} Still a draft; Send tries again.`, "error"] : ["Draft: not sent until you click Send", "hint"];
  if (e.status === "held") return [`Waiting for ${e.to?.name ?? "the agent"} to be free…`, "wait"];
  if (e.status === "sent") return [`Sent to ${e.to?.name ?? "the agent"}`, "wait"];
  if (e.status === "pending") return ["Thinking…", "wait"];
  return [e.a, e.status === "error" ? "error" : "answer"];
}

/** The one line a resolved or collapsed thread shrinks to. @param {Thread} t */
const markerText = (t) => `${t.resolved ? "✓ Resolved" : `▸ ${t.exchanges.length} comment${t.exchanges.length > 1 ? "s" : ""}`} · ${t.exchanges[0].q.split("\n")[0]}`;

/** The text lines an inline thread draws at `cols` columns. @param {Thread} t @param {number} cols @param {{ collapsed: boolean, outdated: boolean }} state @returns {Line[]} */
export function threadLines(t, cols, { collapsed, outdated }) {
  if (t.resolved || collapsed) return [{ text: markerText(t).slice(0, Math.max(8, cols)), tone: "head" }];
  const head = outdated ? `Outdated: ${anchorLabel(t.anchor)} are no longer in this diff` : `Comment on ${anchorLabel(t.anchor)}`;
  const out = [{ text: head.slice(0, Math.max(8, cols)), tone: /** @type {Tone} */ ("head") }];
  for (const e of t.exchanges) {
    out.push(...wrapped(`You: ${e.q}`, cols, "you"));
    const [text, tone] = answerOf(e);
    if (e.status === "done" && e.to) out.push({ text: `${e.to.name}:`, tone: "who" });
    out.push(...wrapped(text, cols, tone, MAX_ANSWER_LINES));
  }
  const hint = isDraft(t) ? "Click to edit, send or discard the draft" : waiting(t) ? "Click to collapse, resolve or delete" : "Click to reply, collapse, resolve or delete";
  out.push({ text: hint, tone: "hint" });
  return out;
}

/** A block's height in px for its line count. @param {number} lines @param {number} lineH */
export const blockHeight = (lines, lineH) => lines * lineH + BLOCK_PAD;

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
