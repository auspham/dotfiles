// Lays a comment's markdown out as rows of fixed height. The virtual list places cards by the heights the script states, so every row's height is counted here and comment_md_view.js draws it at exactly that. Pure: no herdr imports, so node can test it.

import { parseBlocks } from "./markdown_blocks.js";
import { parseInline } from "./markdown_inline.js";
import { wrapSpans, textPx } from "./comment_wrap.js";
import { ADVANCE_EM, BODY_PX } from "./comment_font.js";

/** @typedef {import("./comment_wrap.js").TextLine} TextLine */
/** @typedef {"body" | "h1" | "h2" | "h3"} Size */
/** indent: px before the text; marker: a list item's bullet or number on its first row, drawn in the `markerW` px before the text. */
/** @typedef {{ kind: "text", h: number, spans: TextLine, size: Size, indent: number, quote: boolean, marker: string | null, markerW: number }} TextRow */
/** top/bottom: the row starts or ends its code block and carries the block's padding. */
/** @typedef {{ kind: "code", h: number, s: string, top: boolean, bottom: boolean }} CodeRow */
/** @typedef {{ kind: "gap", h: number }} GapRow */
/** @typedef {TextRow | CodeRow | GapRow} Row */

/** Font px and row height of each text size. A heading is bold and a little larger. */
export const SIZES = { body: { px: BODY_PX, h: 20 }, h1: { px: 16, h: 28 }, h2: { px: 14.5, h: 24 }, h3: { px: BODY_PX, h: 20 } };
/** The px of the parts around rows: gaps between blocks and list items, code block padding and the indents. */
export const MD = { blockGap: 8, itemGap: 2, codePx: 12, codeLine: 18, codePadY: 6, codePadX: 10, nest: 18, quote: 14 };

/** @param {TextLine} spans @param {Partial<TextRow>} at @returns {TextRow} */
const textRow = (spans, at) => ({ kind: "text", h: SIZES[at.size ?? "body"].h, spans, size: "body", indent: 0, quote: false, marker: null, markerW: 0, ...at });

/** Each source line wrapped into text rows. @param {string[]} lines @param {number} width @param {Partial<TextRow>} at */
function textRows(lines, width, at) {
  const size = at.size ?? "body", bold = size !== "body";
  return lines.flatMap((l) => wrapSpans(parseInline(l, bold ? { bold } : {}), width - (at.indent ?? 0), SIZES[size].px))
    .map((spans, i) => textRow(spans, { ...at, marker: i === 0 ? at.marker ?? null : null }));
}

/** A fence's lines cut to the columns that fit, so nothing runs past the card. @param {string[]} lines @param {number} width @returns {CodeRow[]} */
function codeRows(lines, width) {
  const cols = Math.max(8, Math.floor((width - 2 * MD.codePadX) / (ADVANCE_EM * MD.codePx)));
  const cut = (l) => (l.length ? l.match(new RegExp(`.{1,${cols}}`, "gu")) ?? [""] : [""]);
  const all = (lines.length ? lines : [""]).flatMap(cut), last = all.length - 1;
  return all.map((s, i) => ({ kind: "code", s, top: i === 0, bottom: i === last, h: MD.codeLine + (i === 0 ? MD.codePadY : 0) + (i === last ? MD.codePadY : 0) }));
}

/** The px a list marker takes: its characters and a space, at least two columns. @param {string} marker */
const markerPx = (marker) => Math.ceil(textPx(marker.padEnd(Math.max(2, marker.length + 1))));

/** @type {Record<string, (b: any, width: number) => Row[]>} */
const LAYOUT = {
  para: (b, w) => textRows(b.lines, w, {}),
  heading: (b, w) => textRows(b.lines, w, { size: /** @type {Size} */ (`h${b.level}`) }),
  quote: (b, w) => textRows(b.lines, w, { quote: true, indent: MD.quote }),
  code: (b, w) => codeRows(b.lines, w),
  item: (b, w) => textRows(b.lines, w, { indent: b.depth * MD.nest + markerPx(b.marker), marker: b.marker, markerW: markerPx(b.marker) }),
};

/** The rows a comment's markdown draws at `width` px, with a gap between blocks and a smaller one between list items. @param {string} text @param {number} width @returns {Row[]} */
export function markdownRows(text, width) {
  const blocks = parseBlocks(text);
  return blocks.flatMap((b, i) => {
    const gap = i === 0 ? [] : [{ kind: "gap", h: b.kind === "item" && blocks[i - 1].kind === "item" ? MD.itemGap : MD.blockGap }];
    return [...gap, ...LAYOUT[b.kind](b, width)];
  });
}

/** The rows that show text, which is what folding counts. @param {Row[]} rows */
export const contentRows = (rows) => rows.filter((r) => r.kind !== "gap").length;

/** The rows up to `n` rows of text, without a trailing gap. @param {Row[]} rows @param {number} n @returns {Row[]} */
export function firstRows(rows, n) {
  let seen = 0;
  const cut = rows.findIndex((r) => r.kind !== "gap" && ++seen > n), kept = cut < 0 ? rows : rows.slice(0, cut);
  return kept[kept.length - 1]?.kind === "gap" ? kept.slice(0, -1) : kept;
}

/** @param {Row[]} rows */
export const rowsHeight = (rows) => rows.reduce((h, r) => h + r.h, 0);
