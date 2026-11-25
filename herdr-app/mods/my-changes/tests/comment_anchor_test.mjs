import assert from "node:assert/strict";
import { makeAnchor, locate, toUnified, splitSources, anchorLabel, anchorText, parseAnchor } from "../comment_anchor.js";

const ctx = (n, text) => ({ kind: " ", old: n, number: n, text });
const add = (n, text) => ({ kind: "+", number: n, text });
const del = (n, text) => ({ kind: "-", number: n, text });
const hunk = (text = "@@ -1,6 +1,7 @@") => ({ kind: "@", text });

const rows = [hunk(), ctx(1, "import a"), ctx(2, ""), del(3, "let x = 1"), add(3, "let x = 2"), add(4, "let y = x"), ctx(5, "run(x)"), ctx(6, "end")];

const anchor = makeAnchor(rows, 4, 5);
assert.deepEqual(anchor.lines, [{ side: "new", n: 3, text: "let x = 2" }, { side: "new", n: 4, text: "let y = x" }], "anchors the selected lines by side, number and text");
assert.deepEqual(anchor.before, ["import a", "", "let x = 1"], "keeps the lines just before as context");
assert.deepEqual(anchor.after, ["run(x)", "end"], "keeps the lines just after as context");
assert.equal(makeAnchor(rows, 0, 0), null, "a hunk header alone anchors nothing");

assert.deepEqual(locate(anchor, rows), { from: 4, to: 5 }, "finds its lines in the same diff");
const shifted = [hunk(), add(1, "// new header"), ...rows.slice(1).map((r) => ({ ...r, number: (r.number ?? 0) + 1 }))];
assert.deepEqual(locate(anchor, shifted), { from: 5, to: 6 }, "follows its lines when an edit above moves them down");
const edited = rows.map((r) => (r.text === "let y = x" ? { ...r, text: "let y = x + 1" } : r));
assert.equal(locate(anchor, edited), null, "is outdated when its text is gone");

const twice = [hunk(), ctx(1, "a"), add(2, "return 0"), ctx(3, "b"), hunk("@@"), ctx(40, "c"), add(41, "return 0"), ctx(42, "d")];
const second = makeAnchor(twice, 6, 6);
assert.deepEqual(locate(second, twice), { from: 6, to: 6 }, "picks the copy whose number and context fit when the text repeats");
const movedTwice = twice.map((r) => (r.number && r.number > 3 ? { ...r, number: r.number + 5 } : r));
assert.deepEqual(locate(second, movedTwice), { from: 6, to: 6 }, "still picks the copy whose context fits after the numbers move");

const pairs = [rows[0], { kind: "pair", left: { ...rows[1] }, right: rows[1] }, { kind: "pair", left: { ...rows[2] }, right: rows[2] }, { kind: "pair", left: rows[3], right: rows[4] }, { kind: "pair", left: null, right: rows[5] }, { kind: "pair", left: { ...rows[6] }, right: rows[6] }];
assert.deepEqual(toUnified(pairs, rows, 3, 4), { from: 3, to: 5 }, "maps a split selection to the unified rows it draws");
assert.deepEqual(toUnified(pairs, rows, 0, 0), { from: 0, to: 0 }, "a hunk header maps to itself");
assert.deepEqual(splitSources(pairs, rows)[3], [3, 4], "a removed and added pair draws both unified rows");

assert.equal(anchorLabel(anchor), "lines 3-4", "labels a range of new lines");
assert.equal(anchorLabel(makeAnchor(rows, 3, 3)), "removed line 3", "labels removed lines as removed");
assert.equal(anchorText(anchor), "+    3 | let x = 2\n+    4 | let y = x", "quotes the lines with their numbers");

assert.deepEqual(parseAnchor(JSON.parse(JSON.stringify(anchor))), anchor, "a stored anchor reads back unchanged");
assert.equal(parseAnchor({ ...anchor, lines: [] }), null, "an anchor without lines is rejected");
assert.equal(parseAnchor({ ...anchor, lines: [{ side: "mid", n: 1, text: "" }] }), null, "an anchor with a bad side is rejected");
assert.equal(parseAnchor({ ...anchor, before: [1] }), null, "an anchor with bad context is rejected");

console.log("my-changes comment anchors: all checks passed");
