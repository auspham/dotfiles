// The card an inline thread draws, part by part, and its height in px. The virtual list places rows by the heights the script states, so text is wrapped here and every part has a fixed height that comment_card_view.js draws exactly. Pure: no herdr imports, so node can test it.

import { waiting, isDraft } from "./comment_threads.js";
import { threadChip, agentName } from "./comment_status.js";
import { parseBlocks } from "./markdown_blocks.js";
import { plainText } from "./markdown_inline.js";
import { markdownRows, contentRows, firstRows, rowsHeight, MD } from "./comment_rows.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {import("./comment_rows.js").Row} Row */
/** rows: the markdown laid out; queued: waits for Send all; more: rows of text hidden behind Show more. */
/** @typedef {{ who: "you" | "agent", name: string, at: number | null, rows: Row[], tone: "body" | "error", queued: boolean, more: number }} Post */
/** @typedef {{ head: string, chip: import("./comment_status.js").Chip, posts: Post[], foot: string }} Card */
/** @typedef {{ collapsed: boolean, outdated: boolean, expanded: boolean, names: Record<string, string> }} CardState */

// Px of each part; the view draws these. MARGIN is above and below the card, BORDER its top plus bottom edge.
export const PX = { margin: 6, border: 2, head: 34, pad: 10, meta: 22, gap: 4, line: 20, note: 18, foot: 50, marker: 34, padX: 14, indent: 26, maxW: 680 };
// Text past this many rows folds behind Show more until the thread is opened.
export const FOLD_LINES = 6;

/** "Line 2", "Lines 4-6" or "Line 2 (removed)". @param {import("./comment_anchor.js").Anchor} anchor */
export function headLabel(anchor) {
  const fresh = anchor.lines.filter((l) => l.side === "new").map((l) => l.n), list = fresh.length ? fresh : anchor.lines.map((l) => l.n);
  const lo = Math.min(...list), hi = Math.max(...list), span = lo === hi ? `Line ${lo}` : `Lines ${lo}-${hi}`;
  return fresh.length ? span : `${span} (removed)`;
}

/** The px a card's text may use, from the width it is drawn in. @param {number} width the list's width @param {number} left px before the card */
export const cardWidth = (width, left) => Math.max(200, Math.min(PX.maxW, width - left));

/** @param {number} cardW */
const textWidth = (cardW) => cardW - PX.border - 2 * PX.padX - PX.indent - 4;

/** @param {Omit<Post, "rows" | "more"> & { text: string }} spec @param {number} width @param {boolean} expanded */
function post({ text, ...rest }, width, expanded) {
  const all = markdownRows(text, width), n = contentRows(all), fold = !expanded && n > FOLD_LINES + 1;
  return { ...rest, rows: fold ? firstRows(all, FOLD_LINES) : all, more: fold ? n - FOLD_LINES : 0 };
}

/** The posts one exchange draws: the user's comment and, once there is one, the agent's answer or the failure. @param {import("./comment_threads.js").Exchange} e @param {number} width @param {CardState} s @returns {Post[]} */
function exchangePosts(e, width, s) {
  const queued = e.status === "draft", you = post({ who: "you", name: "You", at: e.at, text: e.q, tone: "body", queued }, width, s.expanded);
  if (e.status === "done") return [you, post({ who: "agent", name: agentName(e.to, s.names), at: null, text: e.a, tone: "body", queued: false }, width, s.expanded)];
  if (e.status === "error") return [you, post({ who: "agent", name: agentName(e.to, s.names), at: null, text: e.a, tone: "error", queued: false }, width, true)];
  if (queued && e.a) return [{ ...you, rows: [...you.rows, { kind: "gap", h: MD.blockGap }, ...markdownRows(`Not sent: ${e.a} Send all tries again.`, width)], tone: "error" }];
  return [you];
}

/** What the card's faux input reads, which says what a click on the card is for. @param {Thread} t */
const footOf = (t) => (isDraft(t) ? "Edit or delete the queued comment…" : waiting(t) ? "Waiting for an answer…" : "Reply…");

/** The card for an open thread, or a one-line marker for a resolved or collapsed one. @param {Thread} t @param {number} cardW @param {CardState} s @returns {Card | { marker: string }} */
export function threadCard(t, cardW, s) {
  if (t.resolved || s.collapsed) return { marker: markerText(t) };
  const head = s.outdated ? `${headLabel(t.anchor)}, no longer in this diff` : headLabel(t.anchor);
  const posts = t.exchanges.flatMap((e) => exchangePosts(e, textWidth(cardW), s));
  return { head, chip: threadChip(t, s.names), posts, foot: footOf(t) };
}

/** @param {Thread} t */
function markerText(t) {
  const first = plainText(parseBlocks(t.exchanges[0].q)[0]?.lines[0] ?? ""), answers = t.exchanges.filter((e) => e.status === "done").length;
  if (t.resolved) return `Resolved · ${headLabel(t.anchor)} · ${first}`;
  return `${headLabel(t.anchor)} · ${answers} repl${answers === 1 ? "y" : "ies"} · ${first}`;
}

/** @param {Post} p */
export const postHeight = (p) => 2 * PX.pad + PX.meta + PX.gap + rowsHeight(p.rows) + (p.queued ? PX.note : 0) + (p.more ? PX.line : 0);

/** A card's full height in the list, margins included. @param {Card | { marker: string }} c */
export function cardHeight(c) {
  const inner = "marker" in c ? PX.marker : PX.head + c.posts.reduce((h, p) => h + postHeight(p), 0) + PX.foot;
  return 2 * PX.margin + PX.border + inner;
}

/** The height of an open card's header item in the list: its top margin, top border and header row. The body item takes the rest of cardHeight. */
export const HEAD_H = PX.margin + PX.border / 2 + PX.head;

/** "just now", "5m ago", "3h ago" or "2d ago". @param {number} at @param {number} now */
export function ago(at, now) {
  const m = Math.floor((now - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
}
