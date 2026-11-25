// Draws the rows comment_rows.js lays out, each at exactly the height it counted, so a card never runs into the next diff row.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SIZES, MD } from "./comment_rows.js";

/** @typedef {import("./comment_rows.js").Row} Row */
/** @typedef {import("./comment_rows.js").TextRow} TextRow */
/** @typedef {import("./markdown_inline.js").Span} Span */

/** One styled span. Code sits on a tint in the same font, so it keeps the width the wrap counted. Fira Code has no italic face, so italic also takes the theme's magenta to stay visible. @param {object} t theme @param {Span} sp */
const spanView = (t, sp) => div().flex_none().child(sp.s)
  .when(Boolean(sp.code), (e) => e.bg(t.foreground + "14").rounded(3))
  .when(Boolean(sp.bold), (e) => e.font_bold())
  .when(Boolean(sp.italic), (e) => e.italic().text_color(t.ansi5))
  .when(Boolean(sp.link), (e) => e.text_color(t.accent));

/** A wrapped line, with its list marker or quote bar. @param {object} t @param {TextRow} r */
function textView(t, r) {
  const lead = r.indent - r.markerW;
  return h_flex().relative().h(r.h).flex_none().items_center().whitespace_nowrap().overflow_hidden().text_size(SIZES[r.size].px).pl(lead)
    .when(r.quote, (e) => e.text_color(t.muted).child(div().absolute().left(0).top(0).bottom(0).w(3).bg(t.border)))
    .when(r.markerW > 0, (e) => e.child(div().w(r.markerW).flex_none().text_color(t.muted).child(r.marker ?? "")))
    .children(r.spans.map((sp) => spanView(t, sp)))
    .when(!r.spans.length && !r.marker, (e) => e.child(" "));
}

/** A code block's line on its raised background; the first and last carry the block's padding and corners. @param {object} t @param {import("./comment_rows.js").CodeRow} r */
const codeView = (t, r) => h_flex().h(r.h).flex_none().px(MD.codePadX).items_start().whitespace_nowrap().overflow_hidden()
  .bg(t.background).text_size(MD.codePx).text_color(t.foreground)
  .when(r.top, (e) => e.pt(MD.codePadY).rounded_t(4)).when(r.bottom, (e) => e.rounded_b(4))
  .child(div().h(MD.codeLine).flex().items_center().child(r.s || " "));

/** @type {Record<Row["kind"], (t: object, r: any) => any>} */
const VIEWS = { text: textView, code: codeView, gap: (_t, r) => div().h(r.h).flex_none() };

/** A post's rows. @param {object} t theme @param {Row[]} rows */
export const rowsView = (t, rows) => rows.map((r) => VIEWS[r.kind](t, r));
