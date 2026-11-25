// Lays out comment threads among the diff's rows with their heights, and draws each one's slot in the list.

import { div } from "gpui-kit";
import { terminals, settings } from "herdr";
import { layoutItems, placeThreads, drawnPx, threadBlocks, ADD_KEY } from "./comment_layout.js";
import { threadCard, cardWidth, PX } from "./comment_card.js";
import { cardView, addView } from "./comment_card_view.js";
import { taskNames } from "./comment_status.js";
import { splitSources } from "./comment_anchor.js";

/** @typedef {import("./comment_layout.js").Block} Block */

export const LINE_H = 20;
// A card lines up with the code text, which starts after the 30px line numbers and their 10px gap; RIGHT keeps it clear of the scrollbar.
const LEFT = 40, RIGHT = 14, ADD_H = 34;

/** The selection's last row on screen, where the Comment row goes. @param {any} host */
const selEnd = (host) => (host.sel ? Math.max(host.sel.from, host.sel.to) : -1);

/** The thread the bar has open, whose card shows its folded text. @param {any} host */
const openId = (host) => (host.composer?.mode === "thread" ? host.composer.id : null);

/** @param {any} host @param {boolean} splitting @param {{ cardW: number, names: Record<string, string> }} env @returns {{ out: Block[], marked: Set<number> }} */
function blocks(host, splitting, { cardW, names }) {
  const store = host.comments;
  // While a file loads its rows are empty, and every thread would flash as outdated.
  if (!host.rows.length) return { out: [], marked: new Set() };
  const { placed, outdated, marked } = placeThreads(store.forFile(host.open), host.rows, splitting ? splitSources(host.split, host.rows) : null);
  const block = (thread, after, isOld) => {
    const card = threadCard(thread, cardW, { collapsed: store.collapsed.has(thread.id), outdated: isOld, expanded: openId(host) === thread.id, names });
    return threadBlocks(thread, card, after);
  };
  const out = [...outdated.flatMap((t) => block(t, -1, true)), ...placed.flatMap((p) => block(p.thread, p.after, false))];
  if (host.sel && !host.composer) out.push({ after: selEnd(host), key: ADD_KEY, h: ADD_H + 2 * PX.margin });
  return { out, marked };
}

/** The diff's list items, their heights and the rows to mark in the gutter, kept until something they depend on changes. @param {any} host the Changes view @param {boolean} splitting */
export function commentLayout(host, splitting) {
  const width = Math.max(240, drawnPx(host.diffW, settings().zoom) - 12), cardW = cardWidth(width - RIGHT, LEFT), names = taskNames(terminals());
  const key = [host.mode, host.open, host.splitVersion, host.layoutKey, Math.round(width), host.comments.version, JSON.stringify(host.sel), Boolean(host.composer), openId(host), JSON.stringify(names)].join("|");
  if (host.commentKey === key) return host.commentCache;
  const { out, marked } = blocks(host, splitting, { cardW, names });
  const { items, heights } = layoutItems(splitting ? host.split.length : host.rows.length, splitting ? host.heights : LINE_H, out);
  host.commentKey = key; host.commentCache = { items, heights, marked, width, cardW, open: openId(host) };
  return host.commentCache;
}

/** One block's slot in the list: a thread card's header, its body, its marker, or the Comment row, placed under the code text. A header has only the card's top margin and a body only its bottom one. The list's on_item_click handles its clicks. @param {Block} b @param {object} t theme @param {{ width: number, cardW: number, open: string | null }} lay */
export function blockView(b, t, { width, cardW, open }) {
  const top = b.part === "body" ? 0 : PX.margin, bottom = b.part === "head" ? 0 : PX.margin;
  const slot = div().w(width).h(b.h).flex_none().pl(LEFT).pt(top).pb(bottom).cursor_pointer();
  const inner = div().w(cardW).h(b.h - top - bottom);
  if (!b.card || !b.thread || !b.part) return slot.child(inner.child(addView(t)));
  return slot.child(inner.child(cardView(b.card, t, { now: Date.now(), open: b.thread.id === open, part: b.part, folded: !b.thread.resolved })));
}
