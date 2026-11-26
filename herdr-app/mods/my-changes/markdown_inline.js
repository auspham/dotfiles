// Splits one line of comment markdown into styled spans: `code`, **bold**, *italic* and [links](url) shown as their text. An unclosed marker stays literal. Pure: no herdr imports, so node can test it.

/** @typedef {{ code?: boolean, bold?: boolean, italic?: boolean, link?: boolean }} Style */
/** @typedef {{ s: string } & Style} Span */

// Italic is `*` only, never `_`, so snake_case names in agent answers stay as written.
// Sticky, so each rule tries only at the cursor. Running every rule on the rest of the line at each character made a long plain line quadratic, past the app's render deadline.
/** @type {{ re: RegExp, style: keyof Style | null, raw: boolean }[]} */
const RULES = [
  { re: /\\([\\`*_[\]()#>+\-.!~])/y, style: null, raw: true },
  { re: /(`+)(.+?)\1(?!`)/y, style: "code", raw: true },
  { re: /\*\*(?=\S)(.+?)(?<=\S)\*\*/y, style: "bold", raw: false },
  { re: /\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)/y, style: "italic", raw: false },
  { re: /\[([^\]]+)\]\([^)\s]*\)/y, style: "link", raw: false },
];
// Every rule starts with one of these, so the text up to the next one is plain.
const MARK = /[\\`*[]/g;

/** The first rule that matches at `i`, or null. @param {string} line @param {number} i */
function ruleAt(line, i) {
  for (const r of RULES) { r.re.lastIndex = i; const m = r.re.exec(line); if (m) return { r, m }; }
  return null;
}

/** Where the next possible marker after `i` sits, or the line's end. @param {string} line @param {number} i */
function nextMark(line, i) {
  MARK.lastIndex = i + 1;
  return MARK.exec(line)?.index ?? line.length;
}

/** The inner text a rule matched: a code span's body is its second group. @param {RegExpExecArray} m */
const body = (m) => (m.length > 2 ? m[2].trim() || m[2] : m[1]);

/** Adds a span, merging it into the last one when their styles match. @param {Span[]} out @param {Span} sp */
function push(out, sp) {
  const last = out[out.length - 1], same = last && ["code", "bold", "italic", "link"].every((k) => Boolean(last[k]) === Boolean(sp[k]));
  if (same) last.s += sp.s; else if (sp.s) out.push({ ...sp });
}

/** The styled spans of one line. @param {string} line @param {Style} [style] the style the line sits inside @returns {Span[]} */
export function parseInline(line, style = {}) {
  const out = [];
  for (let i = 0; i < line.length;) {
    const hit = ruleAt(line, i);
    if (!hit) { const end = nextMark(line, i); push(out, { ...style, s: line.slice(i, end) }); i = end; continue; }
    const inner = { ...style, ...(hit.r.style ? { [hit.r.style]: true } : {}) };
    if (hit.r.raw) push(out, { ...inner, s: body(hit.m) });
    else parseInline(body(hit.m), inner).forEach((sp) => push(out, sp));
    i += hit.m[0].length;
  }
  return out;
}

/** A line with its markers taken out, for one-line summaries. @param {string} line */
export const plainText = (line) => parseInline(line).map((sp) => sp.s).join("");
