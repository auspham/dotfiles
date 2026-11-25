// Draws a thread card from its model, at the heights comment_card.js counts. Drawn inside the virtual list's renderer, so nothing here has handlers: the whole card is one click target.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { PX, postHeight, ago } from "./comment_card.js";
import { PROSE_PX, CODE_PX } from "./comment_wrap.js";

/** @typedef {import("./comment_card.js").Card} Card */
/** @typedef {import("./comment_card.js").Post} Post */

// Comment prose is proportional, so a thread reads as a conversation and not as more code. comment_wrap.js estimates its widths for this font.
export const SANS = "Inter";
// Amber is the theme's ANSI yellow, which code highlighting already uses on this background.
const CHIP = { queued: "ansi3", waiting: "working", answered: "ansi2", resolved: "muted", failed: "blocked" };

/** @param {object} t theme @param {import("./comment_status.js").Chip} chip */
const chipView = (t, chip) => div().h(20).px(8).flex().flex_none().items_center().rounded_full().text_size(11).font_medium()
  .bg(t[CHIP[chip.tone]] + "22").text_color(t[CHIP[chip.tone]]).child(chip.label);

/** @param {object} t @param {Post} p */
function avatar(t, p) {
  const bg = p.who === "you" ? t.accent : t.working;
  return div().size(18).flex().flex_none().items_center().justify_center().rounded_full().bg(bg).text_size(10).font_bold().text_color(t.background)
    .child((p.name[0] ?? "?").toUpperCase());
}

/** @param {object} t @param {Post} p @param {number} now */
const metaRow = (t, p, now) => h_flex().h(PX.meta).flex_none().gap(8).items_center().child(avatar(t, p))
  .child(div().font_semibold().text_color(t.foreground).child(p.name))
  .when(p.at !== null, (e) => e.child(div().text_size(12).text_color(t.muted).child(ago(p.at ?? 0, now))));

/** One wrapped line; code spans keep the code font. @param {object} t @param {import("./comment_wrap.js").TextLine} line @param {string} mono */
const lineView = (t, line, mono) => h_flex().h(PX.line).flex_none().items_center().whitespace_nowrap().overflow_hidden()
  .children(line.map((sp) => div().flex_none().when(sp.code, (e) => e.font_family(mono).text_size(CODE_PX)).child(sp.s)))
  .when(!line.length, (e) => e.child(" "));

/** @param {object} t @param {{ post: Post, first: boolean, now: number, mono: string }} spec */
function postView(t, { post, first, now, mono }) {
  const small = (text, color) => div().h(PX.line).pl(PX.indent).flex().items_center().text_size(12).text_color(color).child(text);
  return v_flex().relative().h(postHeight(post)).flex_none().px(PX.padX).py(PX.pad).when(!first, (e) => e.border_t_1().border_color(t.border))
    .when(post.queued, (e) => e.bg(t.ansi3 + "0d").child(div().absolute().left(0).top(0).bottom(0).w(3).bg(t.ansi3)))
    .child(metaRow(t, post, now)).child(div().h(PX.gap).flex_none())
    .child(v_flex().pl(PX.indent).flex_none().text_color(post.tone === "error" ? t.blocked : t.foreground).children(post.lines.map((l) => lineView(t, l, mono))))
    .when(post.more > 0, (e) => e.child(small(`Show more (${post.more} more lines)`, t.accent)))
    .when(post.queued, (e) => e.child(small("Queued, goes out with Send all", t.ansi3).h(PX.note).text_size(11.5)));
}

/** The faux input that says the card is clickable. @param {object} t @param {string} text @param {boolean} resolvable */
const footView = (t, text, resolvable) => h_flex().h(PX.foot).flex_none().px(PX.padX).gap(12).items_center().border_t_1().border_color(t.border)
  .child(div().flex_1().min_w(0).h(30).px(10).flex().items_center().rounded(6).border_1().border_color(t.border).bg(t.background).text_color(t.muted).truncate().child(text))
  .when(resolvable, (e) => e.child(div().flex_none().text_size(12).text_color(t.muted).child("Resolve")));

/** A thread card, or its one-line marker, filling the box it is given. @param {Card | { marker: string }} c @param {object} t theme @param {{ now: number, mono: string, open: boolean }} env open: the bar is on this thread */
export function cardView(c, t, { now, mono, open }) {
  const box = v_flex().size_full().rounded(6).border_1().border_color(open ? t.accent : t.border).bg(t.raised).overflow_hidden().font_family(SANS).text_size(PROSE_PX).text_color(t.foreground);
  if ("marker" in c) return box.child(div().h(PX.marker).px(PX.padX).flex().items_center().text_size(12).text_color(t.muted).truncate().child(c.marker));
  return box
    .child(h_flex().h(PX.head).flex_none().px(PX.padX).gap(8).items_center().border_b_1().border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().text_color(t.muted).child(c.head)).child(chipView(t, c.chip)))
    .children(c.posts.map((post, i) => postView(t, { post, first: i === 0, now, mono })))
    .child(footView(t, c.foot, c.chip.tone !== "queued" && c.chip.tone !== "waiting"));
}

/** The Comment row under a selection, as a small accent card. @param {object} t */
export const addView = (t) => div().size_full().px(PX.padX).flex().items_center().rounded(6).border_1().border_color(t.accent + "66").bg(t.accent + "14")
  .font_family(SANS).text_size(PROSE_PX).text_color(t.accent).child("+ Comment on these lines (c)");
