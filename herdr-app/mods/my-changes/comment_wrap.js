// Wraps comment text to a width in px, keeping `code` spans apart so they draw on a tinted background. Pure: no herdr imports, so node can test it.

/** @typedef {{ s: string, code: boolean }} Span */
/** @typedef {Span[]} TextLine */

import { ADVANCE_EM, BODY_PX } from "./comment_font.js";

// Glyphs past Latin-1 (CJK, emoji, symbols) fall back to another font that may draw them twice as wide; counting two cells errs wide, which only costs slack.
const cells = (ch) => ((ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1);

/** Estimated px width of a run of text in the comment font. @param {string} s @param {number} [size] font px */
export const textPx = (s, size = BODY_PX) => [...s].reduce((w, ch) => w + cells(ch), 0) * ADVANCE_EM * size;

/** A paragraph's words, each knowing whether it is inside backticks; an unclosed backtick stays literal. @param {string} para @returns {Span[]} */
function words(para) {
  const parts = para.split("`"), closed = parts.length % 2 === 1;
  const runs = parts.map((s, i) => ({ s, code: closed && i % 2 === 1 }));
  if (!closed) runs.splice(0, runs.length, { s: para, code: false });
  return runs.flatMap((r) => r.s.split(" ").filter(Boolean).map((s) => ({ s, code: r.code })));
}

/** Cuts a word wider than the line into pieces that fit. @param {Span} w @param {number} width */
function breakWord(w, width) {
  const out = [];
  let piece = "";
  for (const ch of w.s) {
    if (piece && textPx(piece + ch) > width) { out.push({ s: piece, code: w.code }); piece = ""; }
    piece += ch;
  }
  return [...out, { s: piece, code: w.code }];
}

/** Adds a word to a line, joining it to the last span when they share a font. @param {TextLine} line @param {Span} w */
function append(line, w) {
  const last = line[line.length - 1];
  if (!last) return [{ ...w }];
  if (last.code === w.code) return [...line.slice(0, -1), { s: `${last.s} ${w.s}`, code: w.code }];
  // The space between fonts goes on the prose side, so a code span never draws a trailing blank.
  if (last.code) return [...line, { s: ` ${w.s}`, code: false }];
  return [...line.slice(0, -1), { s: `${last.s} `, code: false }, { ...w }];
}

/** @param {TextLine} line */
const linePx = (line) => line.reduce((w, sp) => w + textPx(sp.s), 0);

/** Word-wraps one paragraph. @param {string} para @param {number} width */
function wrapPara(para, width) {
  const out = [];
  let line = [];
  for (const w of words(para).flatMap((w) => (textPx(w.s) > width ? breakWord(w, width) : [w]))) {
    const next = append(line, w);
    if (line.length && linePx(next) > width) { out.push(line); line = [{ ...w }]; } else line = next;
  }
  return [...out, line];
}

/** Word-wraps text to `width` px; a blank line stays as an empty line. @param {string} text @param {number} width @returns {TextLine[]} */
export const wrapPx = (text, width) => text.replace(/\t/g, "    ").split("\n").flatMap((p) => wrapPara(p, Math.max(60, width)));
