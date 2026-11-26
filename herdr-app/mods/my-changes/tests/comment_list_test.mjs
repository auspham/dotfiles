import assert from "node:assert/strict";
import { listRow, listGroups, countLabel, listShown, parseList, listKey, LIST_W, MIN_DIFF_W } from "../comment_list.js";
import { newThread, patchLast, addReply, setResolved } from "../comment_threads.js";

const at = (n, side = "new") => ({ lines: [{ side, n, text: `line ${n}` }], before: [], after: [] });
const thread = (id, path, n, q = "Why?") => newThread({ id, path, anchor: at(n), q, now: 1 });
const paths = ["src/b.js", "src/a.js"];

const t1 = thread("caaaaa1", "src/a.js", 12, "**Why** is this here?\nSecond line");
assert.deepEqual(listRow(t1, paths), { id: "caaaaa1", path: "src/a.js", order: 1, label: "line 12", line: 12, status: "queued", first: "Why is this here?", replies: 0 }, "a row carries the label, status chip, plain first line and reply count");
const answered = addReply(patchLast([t1], t1.id, { status: "done", a: "Because." }), t1.id, "And now?", 2);
const twice = patchLast(answered, t1.id, { status: "done", a: "Still." })[0];
assert.equal(listRow(twice, paths).replies, 2, "counts the answers a thread has had");
assert.equal(listRow(patchLast([t1], t1.id, { status: "sent" })[0], paths).status, "waiting", "a sent comment waits");
assert.equal(listRow(setResolved([t1], t1.id, true)[0], paths).status, "resolved", "a resolved thread says so");
assert.equal(listRow(thread("caaaaa2", "gone.js", 3), paths).order, -1, "a file the range does not show has no place in the diff");
assert.equal(listRow(thread("caaaaa3", "a.js", 1, "x".repeat(500)), paths).first.length, 120, "the first line is cut short before it is shared");
const removed = newThread({ id: "caaaaa4", path: "src/a.js", anchor: { lines: [{ side: "old", n: 7, text: "x" }, { side: "old", n: 8, text: "y" }], before: [], after: [] }, q: "Gone?", now: 1 });
assert.deepEqual([listRow(removed, paths).label, listRow(removed, paths).line], ["removed lines 7-8", 7], "removed lines sort by their old number");

const rows = [
  listRow(thread("c000001", "src/a.js", 30), paths),
  listRow(setResolved([thread("c000002", "src/a.js", 5)], "c000002", true)[0], paths),
  listRow(thread("c000003", "src/a.js", 9), paths),
  listRow(thread("c000004", "zeta.js", 1), paths),
  listRow(thread("c000005", "src/b.js", 40), paths),
  listRow(thread("c000006", "alpha.js", 2), paths),
];
const groups = listGroups(rows);
assert.deepEqual(groups.map((g) => [g.path, g.inDiff]), [["src/b.js", true], ["src/a.js", true], ["alpha.js", false], ["zeta.js", false]], "files go in diff order, then files outside the range by path");
assert.deepEqual(groups[1].rows.map((r) => r.id), ["c000003", "c000001", "c000002"], "open threads go by line, resolved ones after them");
assert.equal(listGroups([]).length, 0, "no threads, no groups");

assert.equal(countLabel(rows), "6 comments, 5 open", "the header counts every thread and the open ones");
assert.equal(countLabel(rows.slice(0, 1)), "1 comment, 1 open", "one comment is singular");
assert.equal(countLabel([]), "No comments in this folder", "an empty folder has one short line");

assert.equal(listShown(true, LIST_W + MIN_DIFF_W), true, "a wide pane shows the column");
assert.equal(listShown(true, LIST_W + MIN_DIFF_W - 1), false, "a narrow pane hides it rather than squash the diff");
assert.equal(listShown(false, 2000), false, "the toggle hides it");

const value = JSON.parse(JSON.stringify({ root: "/repo", rows }));
assert.deepEqual(parseList(value, "/repo"), rows, "published rows read back unchanged");
assert.deepEqual(parseList(value, "/other"), [], "another folder's rows are ignored");
assert.deepEqual(parseList(value, null), [], "a pane with no folder shows none");
assert.deepEqual(parseList({ root: "/repo", rows: [...rows, { ...rows[0], status: "weird" }, { ...rows[0], replies: -1 }, null] }, "/repo"), rows, "bad rows are dropped");
assert.deepEqual(parseList("nope", "/repo"), [], "a non-object reads as no rows");
assert.equal(listKey("A"), "review.list.A", "each tab has its own list key");

console.log("my-changes comment list: all checks passed");
