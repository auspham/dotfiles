// Wraps styled spans of comment text to a width in px, in the comment font's fixed advance. Pure: no herdr imports, so node can test it.

import { ADVANCE_EM, BODY_PX } from "./comment_font.js";

/** @typedef {import("./markdown_inline.js").Span} Span */
/** @typedef {Span[]} TextLine */

const STYLES = /** @type {const} */ (["code", "bold", "italic", "link"]);

// Glyphs past Latin-1 (CJK, emoji, symbols) fall back to another font that may draw them twice as wide; counting two cells errs wide, which only costs slack.
const cells = (ch) => ((ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1);

/** Estimated px width of a run of text in the comment font. @param {string} s @param {number} [size] font px */
export const textPx = (s, size = BODY_PX) => [...s].reduce((w, ch) => w + cells(ch), 0) * ADVANCE_EM * size;

/** @param {Span} a @param {Span} b */
const sameStyle = (a, b) => STYLES.every((k) => Boolean(a[k]) === Boolean(b[k]));

/** The line with neighbouring spans of one style joined, as the view draws one box per span. @param {TextLine} line @returns {TextLine} */
function merge(line) {
  const out = [];
  for (const sp of line) {
    const last = out[out.length - 1];
    if (last && sameStyle(last, sp)) last.s += sp.s; else out.push({ ...sp });
  }
  return out;
}

/** The line's words, each a run of spans with no space, which may change style midway as in `**bold**,`. @param {Span[]} spans @returns {Span[][]} */
function words(spans) {
  const out = [];
  let word = [];
  for (const sp of spans) {
    for (const part of sp.s.split(/( +)/)) {
      if (part.startsWith(" ")) { if (word.length) out.push(word); word = []; } else if (part) word.push({ ...sp, s: part });
    }
  }
  return word.length ? [...out, word] : out;
}

/** Cuts a word wider than the line into pieces that fit. @param {Span[]} word @param {number} width @param {number} size */
function breakWord(word, width, size) {
  const out = [];
  let piece = [], used = 0;
  for (const ch of word.flatMap((sp) => [...sp.s].map((c) => ({ ...sp, s: c })))) {
    if (piece.length && used + textPx(ch.s, size) > width) { out.push(merge(piece)); piece = []; used = 0; }
    piece.push(ch); used += textPx(ch.s, size);
  }
  return [...out, merge(piece)];
}

/** The space between two words: styled like them when they share a style, so `a b` in code stays one tinted box. @param {Span} left @param {Span} right */
const space = (left, right) => (sameStyle(left, right) ? { ...left, s: " " } : { s: " " });

/** @param {TextLine} line @param {number} size */
const linePx = (line, size) => line.reduce((w, sp) => w + textPx(sp.s, size), 0);

/** Word-wraps one line of spans to `width` px at font `size`; an empty line stays one empty line. The line's width is kept as words are added: measuring the whole line again for each word made a long answer slow enough to pass the app's render deadline. @param {Span[]} spans @param {number} width @param {number} [size] @returns {TextLine[]} */
export function wrapSpans(spans, width, size = BODY_PX) {
  const w = Math.max(60, width), gapW = textPx(" ", size), out = [];
  let line = [], used = 0;
  for (const word of words(spans).flatMap((wd) => (linePx(wd, size) > w ? breakWord(wd, w, size) : [wd]))) {
    const wordW = linePx(word, size);
    if (!line.length) { line = [...word]; used = wordW; } else if (used + gapW + wordW > w) { out.push(merge(line)); line = [...word]; used = wordW; } else { line.push(space(line[line.length - 1], word[0]), ...word); used += gapW + wordW; }
  }
  return [...out, merge(line)];
}
