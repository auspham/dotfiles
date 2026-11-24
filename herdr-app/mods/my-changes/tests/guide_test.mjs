import assert from "node:assert/strict";
import { validateGuide, parseGuide, guideEntry, guideStats, headMoved, guidePath, CHANGED, NOT_IN_GUIDE } from "../guide.js";
import { levelOf } from "../triage.js";

const HEAD = "a".repeat(40);
const file = (path, level, sig, reason = "why") => ({ path, level, sig, reason });
const raw = (over = {}) => ({
  name: "login", branch: "agent/login", base: "b".repeat(40), head: HEAD, at: 1, summary: "Looks fine", ...over,
  files: [file("src/a.js", "high", "M:3:1"), file("src/b.js", "skim", "A:10:0", "x".repeat(500))],
});

const dirty = raw();
dirty.files.push(file("../etc/passwd", "high", "M:1:1"), file("/abs", "high", "M:1:1"), file("c.js", "urgent", "M:1:1"), file("d.js", "high", "bad"), file("src/a.js", "skim", "M:3:1"), null, "str", { path: 7 });
const guide = validateGuide(dirty);
assert.deepEqual([...guide.files.keys()], ["src/a.js", "src/b.js"], "a guide file is validated and bad entries dropped");
assert.equal(guide.files.get("src/a.js").level, "high", "the first of two duplicate entries wins");
assert.equal(guide.files.get("src/b.js").reason.length, 200, "reasons are capped");
assert.equal(validateGuide(raw({ head: "nope" })), null, "a guide without a real head sha is rejected");
assert.equal(validateGuide([]), null);
assert.equal(parseGuide("{ not json"), null);
assert.equal(validateGuide(raw({ summary: "a\u0000b" + "y".repeat(900) })).summary.length, 600, "the summary is capped and stripped of control characters");
assert.equal(guidePath({ review: "yours", guide: "/tmp/g.json" }), "/tmp/g.json");
assert.equal(guidePath({ review: "pending", guide: "/tmp/g.json" }), null);
assert.equal(guidePath({ review: "yours", guide: "relative.json" }), null);

assert.deepEqual(guideEntry(guide, "src/a.js", "M:3:1", false), { level: "high", reason: "Coordinator: why", stale: false });
const changed = guideEntry(guide, "src/a.js", "M:4:1", false);
assert.deepEqual([changed.level, changed.reason, changed.stale], ["high", CHANGED, true], "a file whose sig changed is flagged as changed since the coordinator's review");
const missing = guideEntry(guide, "src/new.js", "A:1:0", false);
assert.deepEqual([missing.level, missing.reason], ["normal", NOT_IN_GUIDE], "a changed file missing from the guide is normal");

assert.equal(headMoved(guide, HEAD.slice(0, 12)), false);
assert.equal(headMoved(guide, "c".repeat(40)), true);
const paths = [["src/a.js", "M:3:1"], ["src/b.js", "A:10:0"], ["src/new.js", "A:1:0"]];
const stats = (moved) => guideStats(paths.map(([p, s]) => ({ entry: guideEntry(guide, p, s, moved), reviewed: p === "src/a.js" })));
assert.deepEqual(stats(false), { needYou: 1, normal: 1, skim: 1, done: 1 });
assert.deepEqual(stats(true), { needYou: 3, normal: 0, skim: 0, done: 1 }, "a guide from an older HEAD marks every file as needing the user");

const skim = { level: "skim", reason: "", sig: "M:1:1" };
assert.equal(levelOf([{ level: "high", text: "adds a bare except" }], skim), "high", "a coordinator skim does not hide a high rule flag");
assert.equal(levelOf([], skim), "skim");

console.log("my-changes guide: all checks passed");
