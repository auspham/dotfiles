// Splits comment markdown into blocks: paragraphs, headings, fenced code, list items and quotes. Only this subset is read; anything else stays paragraph text. Pure: no herdr imports, so node can test it.

/** @typedef {{ kind: "para", lines: string[] }} Para */
/** @typedef {{ kind: "heading", level: 1 | 2 | 3, lines: string[] }} Heading */
/** @typedef {{ kind: "code", lines: string[] }} Code */
/** @typedef {{ kind: "item", depth: 0 | 1, marker: string, lines: string[] }} Item */
/** @typedef {{ kind: "quote", lines: string[] }} Quote */
/** @typedef {Para | Heading | Code | Item | Quote} Block */
/** @typedef {{ block: Block | null, next: number }} Read */

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(\s+#+)?\s*$/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const BLANK = /^\s*$/;
// An item indented this far or more is one level down; deeper nesting stays at that level.
const NEST_COLS = 2;

/** A code fence runs to its closing fence of the same character, or to the end. @param {string[]} lines @param {number} i @returns {Read} */
function readFence(lines, i) {
  const mark = (FENCE.exec(lines[i]) ?? [""])[1] ?? "", close = new RegExp(`^ {0,3}${mark[0] === "`" ? "`" : "~"}{${mark.length},}\\s*$`);
  let end = i + 1;
  while (end < lines.length && !close.test(lines[end])) end++;
  return { block: { kind: "code", lines: lines.slice(i + 1, end) }, next: end + 1 };
}

/** @param {string[]} lines @param {number} i @returns {Read} */
function readHeading(lines, i) {
  const m = HEADING.exec(lines[i]) ?? ["", "#", ""];
  const level = /** @type {1 | 2 | 3} */ (Math.min(3, m[1].length));
  return { block: { kind: "heading", level, lines: [m[2]] }, next: i + 1 };
}

/** Lines after a start line that belong to its block: up to a blank line or another block's start. @param {string[]} lines @param {number} i */
function runEnd(lines, i) {
  let end = i + 1;
  while (end < lines.length && !BLANK.test(lines[end]) && !starts(lines[end])) end++;
  return end;
}

/** A list item with its continuation lines, each a line break. @param {string[]} lines @param {number} i @returns {Read} */
function readItem(lines, i) {
  const m = ITEM.exec(lines[i]) ?? ["", "", "-", ""], end = runEnd(lines, i);
  const marker = /^\d/.test(m[2]) ? m[2] : "•", depth = m[1].length >= NEST_COLS ? 1 : 0;
  return { block: { kind: "item", depth, marker, lines: [m[3], ...lines.slice(i + 1, end).map((l) => l.trim())] }, next: end };
}

/** @param {string[]} lines @param {number} i @returns {Read} */
function readQuote(lines, i) {
  let end = i;
  while (end < lines.length && QUOTE.test(lines[end])) end++;
  return { block: { kind: "quote", lines: lines.slice(i, end).map((l) => (QUOTE.exec(l) ?? ["", ""])[1]) }, next: end };
}

/** @param {string[]} lines @param {number} i @returns {Read} */
function readPara(lines, i) {
  const end = runEnd(lines, i);
  return { block: { kind: "para", lines: lines.slice(i, end).map((l) => l.trim()) }, next: end };
}

/** @type {[RegExp, (lines: string[], i: number) => Read][]} */
const READERS = [
  [BLANK, (_lines, i) => ({ block: null, next: i + 1 })],
  [FENCE, readFence],
  [HEADING, readHeading],
  [QUOTE, readQuote],
  [ITEM, readItem],
];

/** Whether a line opens a block other than a paragraph. @param {string} line */
const starts = (line) => READERS.slice(1).some(([re]) => re.test(line));

/** The blocks of a comment's markdown, in order. A single newline is a line break, as in pull request comments. @param {string} text @returns {Block[]} */
export function parseBlocks(text) {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"), out = [];
  for (let i = 0; i < lines.length;) {
    const read = (READERS.find(([re]) => re.test(lines[i]))?.[1] ?? readPara)(lines, i);
    if (read.block) out.push(read.block);
    i = read.next;
  }
  return out;
}
