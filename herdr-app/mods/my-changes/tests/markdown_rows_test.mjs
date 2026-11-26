import assert from "node:assert/strict";
import { parseInline } from "../markdown_inline.js";
import { wrapSpans, textPx } from "../comment_wrap.js";
import { markdownRows, firstRows, contentRows, rowsHeight, SIZES, MD } from "../comment_rows.js";
import { threadCard, cardHeight, postHeight, PX } from "../comment_card.js";
import { newThread, patchLast } from "../comment_threads.js";

const plain = (lines) => lines.map((l) => l.map((sp) => sp.s).join(""));
assert.deepEqual(plain(wrapSpans(parseInline("say **hi**, then go"), 1000)), ["say hi, then go"], "punctuation after a styled word stays attached without a space");
assert.deepEqual(wrapSpans(parseInline("`a b` c"), 1000)[0], [{ s: "a b", code: true }, { s: " c" }], "a code span keeps its inner space and leaves the gap after it untinted");
assert.ok(wrapSpans([{ s: "word ".repeat(20) }], 200, SIZES.h1.px).length > wrapSpans([{ s: "word ".repeat(20) }], 200).length, "a larger heading wraps onto more lines than body text");

const sample = "# Plan\nSome **bold** text.\n\n- one\n  - nested\n2. two\n\n> quoted\n\n```\nconst x = 1;\nrun();\n```";
const rows = markdownRows(sample, 400);
assert.deepEqual(rows.map((r) => r.kind), ["text", "gap", "text", "gap", "text", "gap", "text", "gap", "text", "gap", "text", "gap", "code", "code"], "a mixed answer lays out as text rows, code rows and gaps");
assert.deepEqual([rows[0].size, rows[0].h, rows[0].spans[0].bold], ["h1", SIZES.h1.h, true], "a heading row is bold and taller");
assert.deepEqual([rows[3].h, rows[5].h, rows[7].h], [MD.blockGap, MD.itemGap, MD.itemGap], "list items sit closer together than blocks");
const nested = rows[6], top = rows[4];
assert.ok(nested.indent === top.indent + MD.nest && nested.marker === "•", "a nested item is indented one step and keeps its bullet");
assert.ok(rows[10].quote && rows[10].indent === MD.quote, "a quote row is indented beside its bar");
assert.deepEqual(rows.slice(-2).map((r) => r.h), [MD.codeLine + MD.codePadY, MD.codeLine + MD.codePadY], "a code block's first and last rows carry its padding");
const expected = SIZES.h1.h + MD.blockGap + 20 + MD.blockGap + 20 + MD.itemGap + 20 + MD.itemGap + 20 + MD.blockGap + 20 + MD.blockGap + 2 * MD.codeLine + 2 * MD.codePadY;
assert.equal(rowsHeight(rows), expected, "the rows' height adds up every line, gap and the code block's padding");

const item = markdownRows(`- ${"word ".repeat(30)}`, 300);
assert.ok(item.length > 1 && item.every((r) => r.indent === item[0].indent) && item[1].marker === null, "a wrapped list item hangs under its text and draws its bullet once");
assert.ok(item.every((r) => textPx(r.spans.map((sp) => sp.s).join("")) <= 300 - r.indent), "a wrapped list item fits beside its indent");
const code = markdownRows("```\n" + "x".repeat(200) + "\n```", 300), cols = Math.floor((300 - 2 * MD.codePadX) / textPx("x", MD.codePx));
assert.deepEqual(code.map((r) => r.s.length), [...Array(Math.floor(200 / cols)).fill(cols), 200 % cols].filter((n) => n > 0), "a long code line wraps by character so nothing runs past the card");
assert.deepEqual([code[0].top, code.at(-1).bottom, code[1].top], [true, true, false], "only the block's ends carry its padding");
assert.deepEqual(markdownRows("```\n```", 300).map((r) => r.h), [MD.codeLine + 2 * MD.codePadY], "an empty code block is one padded row");

assert.deepEqual(firstRows(rows, 3).map((r) => r.kind), ["text", "gap", "text", "gap", "text"], "folding keeps the first rows of text and the gaps between them");
assert.equal(firstRows(rows, 2).at(-1).kind, "text", "folding never ends on a gap");
assert.equal(contentRows(rows), 8, "folding counts rows of text and code, not gaps");

const anchor = { lines: [{ side: "new", n: 3, text: "let x = 2" }], before: [], after: [] };
const t = newThread({ id: "cabc123", path: "a.js", anchor, q: "Why?", now: 1 });
const done = patchLast([t], t.id, { status: "done", a: sample, to: { address: "t7", name: "fixer" } })[0];
const card = threadCard(done, 600, { collapsed: false, outdated: false, expanded: true, names: {} });
assert.equal(card.posts[1].rows.length, markdownRows(sample, 600 - PX.border - 2 * PX.padX - PX.indent - 4).length, "an answer's post draws its markdown rows");
assert.equal(cardHeight(card), 2 * PX.margin + PX.border + PX.head + card.posts.reduce((h, p) => h + postHeight(p), 0) + PX.foot, "a card's height counts the rendered markdown, so it never overlaps the next row");
assert.ok(postHeight(card.posts[1]) === 2 * PX.pad + PX.meta + PX.gap + rowsHeight(card.posts[1].rows), "a post's height is its rows' height plus its name row and padding");

const md = newThread({ id: "cmd0001", path: "a.js", anchor, q: "## **Why** use `x`?\nmore", now: 1 });
assert.match(threadCard(md, 600, { collapsed: true, outdated: false, expanded: false, names: {} }).marker, /· Why use x\?$/, "a collapsed thread's marker shows its first line without markdown markers");

// The app's script engine is far slower than node's and interrupts a render that runs past its deadline, so a long one-line answer must cost little work per character. Counted, not timed: the characters regexes may scan (a sticky regex tries one place) and the characters measured.
function work(fn) {
  const exec = RegExp.prototype.exec, iter = String.prototype[Symbol.iterator];
  let chars = 0;
  RegExp.prototype.exec = function (s) { chars += this.sticky ? 1 : String(s).length - (this.global ? this.lastIndex : 0); return exec.call(this, s); };
  String.prototype[Symbol.iterator] = function () { chars += this.length; return iter.call(this); };
  try { fn(); } finally { RegExp.prototype.exec = exec; String.prototype[Symbol.iterator] = iter; }
  return chars;
}
const answer = (n) => "Kept MAX_RETRIES as a constant and added a flag for it, so the limit can change without a redeploy. ".repeat(n);
const grows = (f) => work(() => f(answer(16))) / work(() => f(answer(8)));
assert.ok(grows(parseInline) < 2.5, `parsing a long plain line does work linear in its length (doubling it multiplied the work by ${grows(parseInline).toFixed(1)})`);
const perChar = work(() => wrapSpans([{ s: answer(8) }], 520)) / answer(8).length;
assert.ok(perChar < 5, `wrapping a long line measures each character a few times, not once per word added after it on its line (${perChar.toFixed(1)} per character)`);

console.log("my-changes markdown rows: all checks passed");
