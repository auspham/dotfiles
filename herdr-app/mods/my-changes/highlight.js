// A small regex tokenizer for diff rows: enough colour to read code, not a parser.
// Each token is { s: text, c: class }; a missing class draws in the plain text colour.

const words = (list) => new Set(list.split(/\s+/).filter(Boolean));

const C_LIKE = { line: "//", block: ["/*", "*/"], quotes: "\"'" };
const JS_KEYWORDS = "async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield static get set from as type interface enum implements namespace declare readonly abstract public private protected";

const LANGS = {
  py: { line: "#", quotes: "\"'", triple: true, keywords: words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case"), constants: words("True False None self cls") },
  js: { ...C_LIKE, quotes: "\"'`", keywords: words(JS_KEYWORDS), constants: words("true false null undefined NaN Infinity") },
  go: { ...C_LIKE, quotes: "\"'`", keywords: words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var"), constants: words("true false nil iota") },
  rs: { ...C_LIKE, keywords: words("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while"), constants: words("true false None Some Ok Err") },
  java: { ...C_LIKE, keywords: words("abstract assert break case catch class const continue default do else enum extends final finally for if implements import instanceof interface new package private protected public return static super switch this throw throws try var void volatile while"), constants: words("true false null") },
  c: { ...C_LIKE, keywords: words("auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template using new delete public private protected"), constants: words("true false NULL nullptr") },
  sh: { line: "#", quotes: "\"'", keywords: words("if then else elif fi for while until do done case esac function in select return exit local export readonly source set unset"), constants: words("true false") },
  json: { quotes: "\"", keywords: words(""), constants: words("true false null"), keys: true },
  yaml: { line: "#", quotes: "\"'", keywords: words(""), constants: words("true false null yes no"), yamlKeys: true },
  toml: { line: "#", quotes: "\"'", keywords: words(""), constants: words("true false"), yamlKeys: true },
  css: { block: ["/*", "*/"], quotes: "\"'", keywords: words(""), constants: words(""), css: true },
  md: { quotes: "", keywords: words(""), constants: words(""), md: true },
};

const EXT = {
  py: "py", js: "js", mjs: "js", cjs: "js", jsx: "js", ts: "js", tsx: "js", mts: "js", go: "go", rs: "rs", java: "java", kt: "java",
  c: "c", h: "c", cc: "c", cpp: "c", hpp: "c", cs: "java", sh: "sh", bash: "sh", zsh: "sh", json: "json", yml: "yaml", yaml: "yaml",
  toml: "toml", css: "css", scss: "css", md: "md", markdown: "md",
};

export function langFor(path) {
  const name = (path ?? "").split("/").pop() ?? "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return LANGS[EXT[ext]] ?? null;
}

const NUMBER = /^(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)(?:px|em|rem|vh|vw|ms|s|%)?/;
const IDENT = /^[A-Za-z_$][\w$]*/;

function push(tokens, s, c) {
  if (!s) return;
  const last = tokens[tokens.length - 1];
  if (last && last.c === c) last.s += s;
  else tokens.push({ s, c });
}

// Scans a quoted string from `i`; returns the index after it, or -1 when it runs past the line.
function stringEnd(text, i, quote) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === "\\") { j++; continue; }
    if (text[j] === quote) return j + 1;
  }
  return -1;
}

// state is null, "block", or `str:<delimiter>` for a string that continues onto the next line.
export function tokenize(text, lang, state) {
  const tokens = [];
  let i = 0;
  if (state === "block") {
    const end = text.indexOf(lang.block[1]);
    if (end < 0) { push(tokens, text, "comment"); return { tokens, state }; }
    push(tokens, text.slice(0, end + lang.block[1].length), "comment");
    i = end + lang.block[1].length;
    state = null;
  } else if (state?.startsWith("str:")) {
    const delim = state.slice(4), end = text.indexOf(delim);
    if (end < 0) { push(tokens, text, "string"); return { tokens, state }; }
    push(tokens, text.slice(0, end + delim.length), "string");
    i = end + delim.length;
    state = null;
  }
  if (lang.md) return { tokens: tokenizeMarkdown(text), state };
  let plain = "";
  const flush = () => { push(tokens, plain, undefined); plain = ""; };
  while (i < text.length) {
    const rest = text.slice(i), ch = text[i];
    if (lang.line && rest.startsWith(lang.line) && (lang.line !== "#" || lang !== LANGS.sh || i === 0 || /\s/.test(text[i - 1]))) {
      flush(); push(tokens, rest, "comment"); return { tokens, state };
    }
    if (lang.block && rest.startsWith(lang.block[0])) {
      flush();
      const end = text.indexOf(lang.block[1], i + lang.block[0].length);
      if (end < 0) { push(tokens, rest, "comment"); return { tokens, state: "block" }; }
      push(tokens, text.slice(i, end + lang.block[1].length), "comment");
      i = end + lang.block[1].length;
      continue;
    }
    if (lang.triple && (rest.startsWith('"""') || rest.startsWith("'''"))) {
      flush();
      const delim = rest.slice(0, 3), end = text.indexOf(delim, i + 3);
      if (end < 0) { push(tokens, rest, "string"); return { tokens, state: `str:${delim}` }; }
      push(tokens, text.slice(i, end + 3), "string");
      i = end + 3;
      continue;
    }
    if (lang.quotes && lang.quotes.includes(ch)) {
      flush();
      const end = stringEnd(text, i, ch);
      if (end < 0) {
        push(tokens, rest, "string");
        return { tokens, state: ch === "`" ? "str:`" : state };
      }
      const isKey = lang.keys && /^\s*:/.test(text.slice(end));
      push(tokens, text.slice(i, end), isKey ? "property" : "string");
      i = end;
      continue;
    }
    if (lang.css && ch === "@") {
      const m = IDENT.exec(text.slice(i + 1));
      if (m) { flush(); push(tokens, `@${m[0]}`, "keyword"); i += 1 + m[0].length; continue; }
    }
    if (/\d/.test(ch) && (i === 0 || !/[\w$]/.test(text[i - 1]))) {
      const m = NUMBER.exec(rest);
      if (m) { flush(); push(tokens, m[0], "number"); i += m[0].length; continue; }
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const word = IDENT.exec(rest)[0], after = rest.slice(word.length);
      let c;
      if (lang.keywords.has(word)) c = "keyword";
      else if (lang.constants.has(word)) c = "constant";
      else if ((lang.yamlKeys || lang.css) && /^\s*:(?!:)/.test(after) && /^\s*$/.test(text.slice(0, i).replace(/^[\s-]+/, ""))) c = "property";
      else if (lang.css && /^\s*:/.test(after) && !/[{,]/.test(text.slice(0, i))) c = "property";
      else if (/^\s*\(/.test(after)) c = "function";
      else if (/^[A-Z]/.test(word) && /[a-z]/.test(word)) c = "type";
      if (c) { flush(); push(tokens, word, c); } else plain += word;
      i += word.length;
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
  return { tokens, state };
}

function tokenizeMarkdown(text) {
  const tokens = [];
  if (/^#{1,6}\s/.test(text)) { push(tokens, text, "keyword"); return tokens; }
  if (/^\s*```/.test(text)) { push(tokens, text, "comment"); return tokens; }
  let i = 0, plain = "";
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > 0) { push(tokens, plain, undefined); plain = ""; push(tokens, text.slice(i, end + 1), "string"); i = end + 1; continue; }
    }
    plain += text[i++];
  }
  push(tokens, plain, undefined);
  return tokens;
}

// Colours every diff row in place. Removed lines follow the old side of the file, added ones the new side,
// and context lines both, so a docstring or comment is read the way the file reads it. A hunk header resets both.
export function highlightRows(rows, lang) {
  let before = null, after = null;
  for (const row of rows) {
    if (row.kind === "@") { before = after = null; continue; }
    if (row.kind === "-") { const r = tokenize(row.text, lang, before); row.tokens = r.tokens; before = r.state; }
    else if (row.kind === "+") { const r = tokenize(row.text, lang, after); row.tokens = r.tokens; after = r.state; }
    else if (row.kind === " ") { const r = tokenize(row.text, lang, after); row.tokens = r.tokens; before = after = r.state; }
  }
}

// FNV-1a over the diff text, to notice that a file changed after it was marked reviewed.
export function hashLines(lines) {
  let h = 0x811c9dc5;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) { h ^= line.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 10; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// Breaks a line's tokens into visual lines of at most `cols` characters, preferring a space near the edge,
// and indents the continuation lines like the first so wrapped code still reads as one statement.
export function wrapTokens(tokens, cols) {
  const first = tokens[0]?.s ?? "";
  const indent = Math.min(first.length - first.trimStart().length, Math.floor(cols / 2));
  const pad = " ".repeat(indent);
  const lines = [[]];
  let used = 0;
  const next = () => { lines.push(indent ? [{ s: pad }] : []); used = indent; };
  for (const token of tokens) {
    let text = token.s;
    while (text.length) {
      if (used >= cols) next();
      const room = cols - used;
      if (text.length <= room) { lines[lines.length - 1].push({ s: text, c: token.c }); used += text.length; break; }
      const space = text.lastIndexOf(" ", room);
      const cut = space > 0 && space > room - 14 ? space + 1 : room;
      lines[lines.length - 1].push({ s: text.slice(0, cut), c: token.c });
      text = text.slice(cut);
      next();
    }
  }
  return lines;
}
