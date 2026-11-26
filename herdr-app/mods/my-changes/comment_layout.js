// Where threads sit among the diff rows, and every list item's height. The virtual list places rows by heights the script states. Pure: no herdr imports, so node can test it.

import { locate } from "./comment_anchor.js";
import { cardHeight, postHeight, HEAD_H, PX } from "./comment_card.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {import("./comment_card.js").Card | { marker: string }} CardModel */
/** part: which piece of a thread card the block draws; last: it is the card's bottom piece. */
/** @typedef {{ after: number, key: string, h: number, thread?: Thread, card?: CardModel, part?: "head" | "body" | "foot" | "resolve" | "marker", last?: boolean }} Block after: the row it sits under, -1 for the top */
/** @typedef {{ op: "add" } | { op: "fold" | "open" | "resolve", id: string }} BlockClick */
/** @typedef {{ row: number } | { block: Block }} Item */

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

export const ADD_KEY = "cm-add";

/** A thread block's list key, ending in the letter CLICK reads. It must not end in a digit: pickRow reads a trailing number as a row index. @param {string} id @param {"h" | "t" | "f" | "r"} end */
const threadKey = (id, end) => `cm-${id}-${end}`;
// The header folds the thread, the posts and the reply box open it in the bar, and the Resolve row resolves it.
const CLICK = { h: "fold", t: "open", f: "open", r: "resolve" };

/** What a click on a list key does, or null for a diff row. The key may carry the view mode in front. @param {string} key @returns {BlockClick | null} */
export function blockClick(key) {
  if (key.endsWith(ADD_KEY)) return { op: "add" };
  const m = /cm-([a-z0-9]+)-([htfr])$/.exec(key);
  return m ? { op: CLICK[m[2]], id: m[1] } : null;
}

/** A thread's blocks under row `after`. The list reports only which item was clicked, and its items stack, so each part of an open card with its own click is an item: the header, the posts, the reply box and the Resolve row. A collapsed thread's marker unfolds it; a resolved one opens it. @param {Thread} thread @param {CardModel} card @param {number} after @returns {Block[]} */
export function threadBlocks(thread, card, after) {
  if ("marker" in card) return [{ after, key: threadKey(thread.id, thread.resolved ? "t" : "h"), h: cardHeight(card), thread, card, part: "marker", last: true }];
  const bottom = PX.border / 2 + PX.margin;
  /** @type {{ part: Block["part"], end: "h" | "t" | "f" | "r", h: number }[]} */
  const parts = [{ part: "head", end: "h", h: HEAD_H }, { part: "body", end: "t", h: card.posts.reduce((h, p) => h + postHeight(p), 0) }, { part: "foot", end: "f", h: PX.foot }];
  if (card.resolvable) parts.push({ part: "resolve", end: "r", h: PX.act });
  return parts.map(({ part, end, h }, i) => {
    const last = i === parts.length - 1;
    return { after, key: threadKey(thread.id, end), h: last ? h + bottom : h, thread, card, part, last };
  });
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

/** A size on_size_change measured, in logical px, as the units the view draws with at the app's zoom. @param {number} px @param {unknown} zoom settings().zoom @returns {number} */
export function drawnPx(px, zoom) {
  return typeof zoom === "number" && zoom > 0 ? px / zoom : px;
}
