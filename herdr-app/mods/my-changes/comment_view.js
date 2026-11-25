// Draws comment threads inline in the diff, and lays them out among its rows with their heights.

import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { threadLines, blockHeight, blockCols, layoutItems, placeThreads } from "./comment_layout.js";
import { splitSources } from "./comment_anchor.js";

/** @typedef {import("./comment_layout.js").Block} Block */

export const LINE_H = 20, CHAR = 6.7;
// A block starts after the line numbers and keeps clear of the scrollbar; INSET is that margin plus its rail and padding.
const MARGIN = 40, INSET = MARGIN + 2 + 16 + 14;
// Room under the last row, so the comment bar never covers it.
const BAR_ROOM = 130;
const ADD_KEY = "cm-add", ROOM_KEY = "cm-room";

/** A list key for a thread block. It must not end in a digit: pickRow reads a trailing number as a row index. @param {string} id */
const blockKey = (id) => `cm-${id}-t`;

/** The thread id a clicked list key names, "add" for the Comment row, or null for a diff row. @param {string} key */
export function commentKey(key) {
  if (key.endsWith(ADD_KEY)) return "add";
  const m = /cm-([a-z0-9]+)-t$/.exec(key);
  return m ? m[1] : null;
}

/** The selection's last row on screen, where the Comment row goes. @param {any} host */
const selEnd = (host) => (host.sel ? Math.max(host.sel.from, host.sel.to) : -1);

/** @param {any} host @param {boolean} splitting @param {number} width */
function blocks(host, splitting, width) {
  const store = host.comments, cols = blockCols(width, CHAR, INSET);
  // While a file loads its rows are empty, and every thread would flash as outdated.
  if (!host.rows.length) return { out: [], marked: new Set() };
  const { placed, outdated, marked } = placeThreads(store.forFile(host.open), host.rows, splitting ? splitSources(host.split, host.rows) : null);
  const block = (thread, after, isOld) => {
    const lines = threadLines(thread, cols, { collapsed: store.collapsed.has(thread.id), outdated: isOld });
    return { after, key: blockKey(thread.id), h: blockHeight(lines.length, LINE_H), thread, lines };
  };
  const out = [...outdated.map((t) => block(t, -1, true)), ...placed.map((p) => block(p.thread, p.after, false))];
  if (host.sel && !host.composer) out.push({ after: selEnd(host), key: ADD_KEY, h: blockHeight(1, LINE_H), lines: [{ text: "+ Comment on these lines (c)", tone: "add" }] });
  if (host.composer || store.drafts() > 0) out.push({ after: (splitting ? host.split.length : host.rows.length) - 1, key: ROOM_KEY, h: BAR_ROOM, lines: [] });
  return { out, marked };
}

/** The diff's list items, their heights and the rows to mark in the gutter, kept until something they depend on changes. @param {any} host the Changes view @param {boolean} splitting */
export function commentLayout(host, splitting) {
  const width = Math.max(240, host.diffW - 12);
  const key = [host.mode, host.open, host.splitVersion, host.layoutKey, Math.round(width), host.comments.version, JSON.stringify(host.sel), Boolean(host.composer), host.comments.drafts()].join("|");
  if (host.commentKey === key) return host.commentCache;
  const { out, marked } = blocks(host, splitting, width);
  const count = splitting ? host.split.length : host.rows.length;
  const { items, heights } = layoutItems(count, splitting ? host.heights : LINE_H, out);
  host.commentKey = key; host.commentCache = { items, heights, marked, width };
  return host.commentCache;
}

/** @param {object} t theme @param {string} tone */
const toneColor = (t, tone) => ({ head: t.muted, you: t.foreground, who: t.ansi5, answer: t.foreground, wait: t.working, error: t.blocked, hint: t.dim, add: t.accent })[tone] ?? t.foreground;

/** One inline block: a thread or the Comment row. Drawn inside the list's renderer, so it has no handlers; the list's on_item_click handles its clicks. @param {Block & { lines: { text: string, tone: string }[] }} b @param {object} t theme @param {number} width */
export function blockView(b, t, width) {
  if (!b.lines.length) return div().w(width).h(b.h).flex_none();
  const open = b.thread && !b.thread.resolved && b.lines.length > 1;
  return div().w(width).h(b.h).flex_none().pl(MARGIN).py(5).cursor_pointer()
    .child(v_flex().w_full().h_full().pl(8).pr(8).border_l(2).border_color(b.thread?.resolved ? t.border : t.accent).bg(b.thread ? (open ? t.raised : t.background) : t.accent + "14")
      .children(b.lines.map((l) => div().h(LINE_H).flex_none().truncate().text_color(toneColor(t, l.tone)).when(l.tone === "you", (e) => e.font_semibold()).child(l.text || " "))));
}
