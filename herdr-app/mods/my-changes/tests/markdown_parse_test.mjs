import assert from "node:assert/strict";
import { parseBlocks } from "../markdown_blocks.js";
import { parseInline } from "../markdown_inline.js";

const kinds = (text) => parseBlocks(text).map((b) => b.kind);
assert.deepEqual(parseBlocks("one\ntwo\n\nthree"), [{ kind: "para", lines: ["one", "two"] }, { kind: "para", lines: ["three"] }], "a blank line starts a new paragraph and a single newline is a line break");
assert.deepEqual(parseBlocks("# Title\n## Part\n### Small"), [1, 2, 3].map((level, i) => ({ kind: "heading", level, lines: [["Title", "Part", "Small"][i]] })), "# and ## are headings, and deeper ones are bold body lines");
assert.deepEqual(kinds("#hashtag"), ["para"], "a hash without a space is plain text");
assert.deepEqual(parseBlocks("```js\nlet a = 1;\n\n  b();\n```\nafter"), [{ kind: "code", lines: ["let a = 1;", "", "  b();"] }, { kind: "para", lines: ["after"] }], "a fenced block keeps its lines verbatim, blank and indented ones too");
assert.deepEqual(parseBlocks("```\n**not bold**"), [{ kind: "code", lines: ["**not bold**"] }], "an unclosed fence runs to the end");
assert.deepEqual(parseBlocks("- a\n  more\n  - b\n1. c"), [
  { kind: "item", depth: 0, marker: "•", lines: ["a", "more"] },
  { kind: "item", depth: 1, marker: "•", lines: ["b"] },
  { kind: "item", depth: 0, marker: "1.", lines: ["c"] },
], "list items keep their continuation lines, one level of nesting and their numbers");
assert.equal(parseBlocks("- a\n      - deep")[1].depth, 1, "nesting deeper than one level stays at one level");
assert.deepEqual(parseBlocks("> quoted\n> on two\nplain"), [{ kind: "quote", lines: ["quoted", "on two"] }, { kind: "para", lines: ["plain"] }], "consecutive > lines are one quote");
assert.deepEqual(kinds("text\n- item"), ["para", "item"], "a list can start right under a paragraph");
assert.deepEqual(kinds("<b>hi</b>\n| a | b |\n---"), ["para"], "html, tables and rules fall back to plain text");

assert.deepEqual(parseInline("use `greet()` here"), [{ s: "use " }, { s: "greet()", code: true }, { s: " here" }], "backticks make a code span");
assert.deepEqual(parseInline("`a **b**`"), [{ s: "a **b**", code: true }], "nothing is parsed inside a code span");
assert.deepEqual(parseInline("**bold *both* end**"), [{ s: "bold ", bold: true }, { s: "both", bold: true, italic: true }, { s: " end", bold: true }], "italic nests inside bold");
assert.deepEqual(parseInline("an *aside*."), [{ s: "an " }, { s: "aside", italic: true }, { s: "." }], "single stars make italic");
assert.deepEqual(parseInline("snake_case_name and 2 * 3 * 4"), [{ s: "snake_case_name and 2 * 3 * 4" }], "underscores and spaced stars stay literal");
assert.deepEqual(parseInline("see [the docs](https://x.y/z) now"), [{ s: "see " }, { s: "the docs", link: true }, { s: " now" }], "a link shows its text and drops the url");
assert.deepEqual(parseInline("a ` b **c"), [{ s: "a ` b **c" }], "unclosed markers stay literal");
assert.deepEqual(parseInline("\\*not\\*"), [{ s: "*not*" }], "a backslash escapes a marker");

console.log("my-changes markdown parse: all checks passed");
