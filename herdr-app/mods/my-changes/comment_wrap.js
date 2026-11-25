// Wraps comment text to a width in px, keeping `code` spans apart so they can be drawn monospace. Pure: no herdr imports, so node can test it.

/** @typedef {{ s: string, code: boolean }} Span */
/** @typedef {Span[]} TextLine */

export const PROSE_PX = 13, CODE_PX = 12;
// Widths in em for the prose font (Inter), each rounded up. There is no text measuring call, and a guess that is too narrow clips text, so they err wide.
const EM = [["ijlI.,:;'|!", 0.3], [" frt\"-/*", 0.42], ["()[]{}", 0.47], ["mwM@%", 0.95], ["W", 1.04], ["ABCDEFGHJKLNOPQRSTUVXYZ&", 0.76], ["0123456789", 0.68]];
const CODE_W = 0.62 * CODE_PX;

/** The px one character takes. @param {string} ch @param {boolean} code */
function charPx(ch, code) {
  if (code) return CODE_W;
  const hit = EM.find(([set]) => set.includes(ch));
  return (hit ? hit[1] : 0.62) * PROSE_PX;
}

/** Estimated px width of a run of text. @param {string} s @param {boolean} code */
export const textPx = (s, code) => [...s].reduce((w, ch) => w + charPx(ch, code), 0);

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
    if (piece && textPx(piece + ch, w.code) > width) { out.push({ s: piece, code: w.code }); piece = ""; }
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
const linePx = (line) => line.reduce((w, sp) => w + textPx(sp.s, sp.code), 0);

/** Word-wraps one paragraph. @param {string} para @param {number} width */
function wrapPara(para, width) {
  const out = [];
  let line = [];
  for (const w of words(para).flatMap((w) => (textPx(w.s, w.code) > width ? breakWord(w, width) : [w]))) {
    const next = append(line, w);
    if (line.length && linePx(next) > width) { out.push(line); line = [{ ...w }]; } else line = next;
  }
  return [...out, line];
}

/** Word-wraps text to `width` px; a blank line stays as an empty line. @param {string} text @param {number} width @returns {TextLine[]} */
export const wrapPx = (text, width) => text.replace(/\t/g, "    ").split("\n").flatMap((p) => wrapPara(p, Math.max(60, width)));
