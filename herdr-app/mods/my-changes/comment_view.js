// Draws comment threads inline in the diff, and lays them out among its rows with their heights.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { threadLines, blockHeight, lineHeight, blockCols, layoutItems, placeThreads } from "./comment_layout.js";
import { splitSources } from "./comment_anchor.js";

/** @typedef {import("./comment_layout.js").Block} Block */

export const LINE_H = 20, CHAR = 6.7;
// A card starts after the line numbers and keeps clear of the scrollbar; INSET is both margins plus its border, rail and padding, so wrapped text never truncates.
const MARGIN = 40, RIGHT = 14, RAIL = 3, INSET = MARGIN + RIGHT + 2 + RAIL + 20;
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
    return { after, key: blockKey(thread.id), h: blockHeight(lines, LINE_H), thread, lines };
  };
  const out = [...outdated.map((t) => block(t, -1, true)), ...placed.map((p) => block(p.thread, p.after, false))];
  const add = [{ text: "+ Comment on these lines (c)", tone: "add" }];
  if (host.sel && !host.composer) out.push({ after: selEnd(host), key: ADD_KEY, h: blockHeight(add, LINE_H), lines: add });
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

const TONE = { head: "foreground", you: "foreground", who: "ansi5", body: "foreground", error: "blocked", hint: "muted", marker: "muted", add: "accent" };
// Amber is the theme's ANSI yellow, which code highlighting already uses on this background.
const CHIP = { queued: "ansi3", waiting: "working", answered: "ansi2", resolved: "muted", failed: "blocked" };
const BOLD = new Set(["head", "you", "who"]);

/** @param {object} t theme @param {import("./comment_status.js").Chip} chip */
const chipView = (t, chip) => div().h(16).px(6).flex().flex_none().items_center().rounded(4).text_size(10.5).font_semibold()
  .bg(t[CHIP[chip.tone]] + "26").text_color(t[CHIP[chip.tone]]).child(chip.label);

/** @param {object} t theme @param {import("./comment_layout.js").Line} l */
function lineView(t, l) {
  const row = div().h(lineHeight(l, LINE_H)).flex_none().truncate().text_color(t[TONE[l.tone]] ?? t.foreground).when(BOLD.has(l.tone), (e) => e.font_semibold());
  if (l.chip) return h_flex().h(LINE_H).flex_none().gap(8).items_center().child(row.child(l.text)).child(chipView(t, l.chip));
  return l.tone === "hint" ? row.italic().text_size(10.5).child(l.text) : row.child(l.text || " ");
}

/** One inline card: a thread, the Comment row, or the room left for the comment bar. Drawn inside the list's renderer, so it has no handlers; the list's on_item_click handles its clicks. The px here are the ones BLOCK_PAD and INSET count. @param {Block & { lines: import("./comment_layout.js").Line[] }} b @param {object} t theme @param {number} width */
export function blockView(b, t, width) {
  const box = div().w(width).h(b.h).flex_none();
  if (!b.lines.length) return box;
  const open = b.thread && !b.thread.resolved && b.lines.length > 1;
  const rail = b.thread?.resolved ? t.border : t.accent;
  return box.pl(MARGIN).pr(RIGHT).py(5).cursor_pointer()
    .child(h_flex().size_full().rounded(4).overflow_hidden().border_1().border_color(t.border).bg(open ? t.raised : b.thread ? t.background : t.accent + "14")
      .child(div().w(RAIL).h_full().flex_none().bg(rail))
      .child(v_flex().flex_1().min_w(0).h_full().px(10).py(4).children(b.lines.map((l) => lineView(t, l)))));
}
