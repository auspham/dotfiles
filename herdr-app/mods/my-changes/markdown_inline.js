// Splits one line of comment markdown into styled spans: `code`, **bold**, *italic* and [links](url) shown as their text. An unclosed marker stays literal. Pure: no herdr imports, so node can test it.

/** @typedef {{ code?: boolean, bold?: boolean, italic?: boolean, link?: boolean }} Style */
/** @typedef {{ s: string } & Style} Span */

// Italic is `*` only, never `_`, so snake_case names in agent answers stay as written.
/** @type {{ re: RegExp, style: keyof Style | null, raw: boolean }[]} */
const RULES = [
  { re: /^\\([\\`*_[\]()#>+\-.!~])/, style: null, raw: true },
  { re: /^(`+)(.+?)\1(?!`)/, style: "code", raw: true },
  { re: /^\*\*(?=\S)(.+?)(?<=\S)\*\*/, style: "bold", raw: false },
  { re: /^\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)/, style: "italic", raw: false },
  { re: /^\[([^\]]+)\]\([^)\s]*\)/, style: "link", raw: false },
];

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
    const rest = line.slice(i), hit = RULES.map((r) => ({ r, m: r.re.exec(rest) })).find((x) => x.m);
    if (!hit?.m) { push(out, { ...style, s: line[i] }); i++; continue; }
    const inner = { ...style, ...(hit.r.style ? { [hit.r.style]: true } : {}) };
    if (hit.r.raw) push(out, { ...inner, s: body(hit.m) });
    else parseInline(body(hit.m), inner).forEach((sp) => push(out, sp));
    i += hit.m[0].length;
  }
  return out;
}
