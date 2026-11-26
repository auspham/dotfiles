// Draws a thread card from its model, at the heights comment_card.js counts. Drawn inside the virtual list's renderer, so nothing here has handlers: an open card is two list items, its header (which folds the thread) and its body (which opens it), and a marker is one.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { PX, postHeight, ago } from "./comment_card.js";
import { COMMENT_FONT, BODY_PX } from "./comment_font.js";
import { rowsView } from "./comment_md_view.js";

/** @typedef {import("./comment_card.js").Card} Card */
/** @typedef {import("./comment_card.js").Post} Post */

// The card's chrome (header, chip, times, footer) stays in the UI font; posts use COMMENT_FONT.
export const SANS = "Inter";
// Amber is the theme's ANSI yellow, which code highlighting already uses on this background.
const CHIP = { queued: "ansi3", waiting: "working", answered: "ansi2", resolved: "muted", failed: "blocked" };

/** @param {object} t theme @param {import("./comment_status.js").Chip} chip */
export const chipView = (t, chip) => div().h(20).px(8).flex().flex_none().items_center().rounded_full().text_size(11).font_medium()
  .bg(t[CHIP[chip.tone]] + "22").text_color(t[CHIP[chip.tone]]).child(chip.label);

/** @param {object} t @param {Post} p */
function avatar(t, p) {
  const bg = p.who === "you" ? t.accent : t.working;
  return div().size(18).flex().flex_none().items_center().justify_center().rounded_full().bg(bg).text_size(10).font_bold().text_color(t.background)
    .child((p.name[0] ?? "?").toUpperCase());
}

/** @param {object} t @param {Post} p @param {number} now */
const metaRow = (t, p, now) => h_flex().h(PX.meta).flex_none().gap(8).items_center().child(avatar(t, p))
  .child(div().font_family(COMMENT_FONT).text_size(BODY_PX).font_bold().text_color(t.foreground).child(p.name))
  .when(p.at !== null, (e) => e.child(div().text_size(12).text_color(t.muted).child(ago(p.at ?? 0, now))));

/** @param {object} t @param {{ post: Post, first: boolean, now: number }} spec */
function postView(t, { post, first, now }) {
  const small = (text, color) => div().h(PX.line).pl(PX.indent).flex().items_center().text_size(12).text_color(color).child(text);
  return v_flex().relative().h(postHeight(post)).flex_none().px(PX.padX).py(PX.pad).when(!first, (e) => e.border_t_1().border_color(t.border))
    .when(post.queued, (e) => e.bg(t.ansi3 + "0d").child(div().absolute().left(0).top(0).bottom(0).w(3).bg(t.ansi3)))
    .child(metaRow(t, post, now)).child(div().h(PX.gap).flex_none())
    .child(v_flex().pl(PX.indent).flex_none().text_color(post.tone === "error" ? t.blocked : t.foreground).font_family(COMMENT_FONT).text_size(BODY_PX).children(rowsView(t, post.rows)))
    .when(post.more > 0, (e) => e.child(small(`Show more (${post.more} more lines)`, t.accent)))
    .when(post.queued, (e) => e.child(small("Queued, goes out with Send all", t.ansi3).h(PX.note).text_size(11.5)));
}

/** The faux input that says the card is clickable. @param {object} t @param {string} text @param {boolean} resolvable */
const footView = (t, text, resolvable) => h_flex().h(PX.foot).flex_none().px(PX.padX).gap(12).items_center().border_t_1().border_color(t.border)
  .child(div().flex_1().min_w(0).h(30).px(10).flex().items_center().rounded(6).border_1().border_color(t.border).bg(t.background).text_color(t.muted).truncate().child(text))
  .when(resolvable, (e) => e.child(div().flex_none().text_size(12).text_color(t.muted).child("Resolve")));

/** @param {object} t @param {"down" | "right"} dir */
const chevron = (t, dir) => svg(`mods/workspace-chrome/chevron-${dir}.svg`).size(11).flex_none().text_color(t.muted);

/** One piece of a thread card, filling the box it is given: the header, the posts and footer under it, or the one-line marker. @param {Card | { marker: string }} c @param {object} t theme @param {{ now: number, open: boolean, part: "head" | "body" | "marker", folded: boolean }} env open: the bar is on this thread; folded: the marker unfolds the thread on click, so it shows the chevron */
export function cardView(c, t, { now, open, part, folded }) {
  const box = v_flex().size_full().border_color(open ? t.accent : t.border).bg(t.raised).overflow_hidden().font_family(SANS).text_size(13).text_color(t.foreground);
  if ("marker" in c) return box.rounded(6).border_1().child(h_flex().h(PX.marker).px(PX.padX).gap(8).items_center().text_size(12).text_color(t.muted)
    .when(folded, (e) => e.child(chevron(t, "right"))).child(div().flex_1().min_w(0).truncate().child(c.marker)));
  if (part === "head") return box.rounded_t(6).border_t_1().border_x_1()
    .child(h_flex().h(PX.head).flex_none().px(PX.padX).gap(8).items_center().border_b_1().border_color(t.border).child(chevron(t, "down"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().text_color(t.muted).child(c.head)).child(chipView(t, c.chip)));
  return box.rounded_b(6).border_b_1().border_x_1()
    .children(c.posts.map((post, i) => postView(t, { post, first: i === 0, now })))
    .child(footView(t, c.foot, c.chip.tone !== "queued" && c.chip.tone !== "waiting"));
}

/** The Comment row under a selection, as a small accent card. @param {object} t */
export const addView = (t) => div().size_full().px(PX.padX).flex().items_center().rounded(6).border_1().border_color(t.accent + "66").bg(t.accent + "14")
  .font_family(SANS).text_size(13).text_color(t.accent).child("+ Comment on these lines (c)");
