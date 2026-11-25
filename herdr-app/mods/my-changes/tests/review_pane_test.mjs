import assert from "node:assert/strict";
import { findReviewPane, splitTarget, followFocus, reviewRecord, parseRecord, needsReload, toggleToApply, reviewKey, TOGGLE_TTL_MS } from "../review_pane.js";

const terminalPane = (pane, tab) => ({ pane, tab, terminal: `t-${pane}` });
const modPane = (pane, tab, mod = "my-changes") => ({ pane, tab, terminal: null, mod });
const all = [terminalPane("p1", "A"), modPane("p2", "A"), terminalPane("p3", "B"), modPane("p4", "B", "files")];

assert.equal(findReviewPane(all, "A"), "p2", "finds the review pane in the tab");
assert.equal(findReviewPane(all, "B"), null, "another mod's pane is not a review pane");
assert.equal(findReviewPane(all, null), null, "no tab means no review pane");

assert.equal(splitTarget({ pane: "p1" }, all), "p1", "splits the focused terminal pane");
assert.equal(splitTarget({ pane: null }, all), null, "a focused layout block gives no pane to split, so the diff stays in the panel");
assert.equal(splitTarget({ pane: "p4" }, all), null, "a focused mod pane is not split");
assert.equal(splitTarget(null, all), null, "nothing focused gives no pane to split");

const fresh = { cwd: "/space", on: null }, last = { cwd: "/repo", on: null };
assert.equal(followFocus(modPane("p2", "A"), fresh, last), last, "keeps the last folder while the review pane has focus");
assert.equal(followFocus(terminalPane("p1", "A"), fresh, last), fresh, "follows a focused terminal");
assert.equal(followFocus(modPane("p4", "B", "files"), fresh, last), fresh, "follows the space folder for another mod's pane, as before");
assert.equal(followFocus(modPane("p2", "A"), fresh, null), fresh, "with no folder yet, takes the fresh one");
assert.equal(followFocus(modPane("p2", "A"), null, "t7"), "t7", "keeps the coordinator's guide terminal while the review pane has focus");

const file = { path: "src/a.js", status: "M", fresh: false, binary: false, add: 3, del: 1, hash: "h1", changedSince: true };
const record = reviewRecord({ tab: "A", root: "/repo", on: undefined, against: "HEAD", hasHead: true, file, reviewed: false, stale: false });
assert.deepEqual(record.file, { path: "src/a.js", status: "M", fresh: false, binary: false, add: 3, del: 1, hash: "h1" }, "publishes only the file fields the pane needs");
assert.equal(record.on, null, "a local folder publishes on as null");
assert.deepEqual(parseRecord(JSON.parse(JSON.stringify(record))), record, "a published record reads back unchanged");
assert.equal(parseRecord({ ...record, root: "" }), null, "a record without a root is rejected");
assert.equal(parseRecord({ ...record, file: { ...record.file, add: -1 } }), null, "a record with a bad count is rejected");
assert.equal(parseRecord("nope"), null, "a non-object is rejected");
assert.equal(reviewKey("A"), "review.open.A", "each tab has its own key");

assert.equal(needsReload(null, record), true, "the first record loads the diff");
assert.equal(needsReload(record, { ...record, reviewed: true }), false, "a reviewed tick only redraws");
assert.equal(needsReload(record, { ...record, file: { ...record.file, path: "b.js" } }), true, "another file loads its diff");
assert.equal(needsReload(record, { ...record, file: { ...record.file, hash: "h2" } }), true, "an edited file loads its diff again");
assert.equal(needsReload(record, { ...record, against: "abc" }), true, "another range loads the diff again");

const now = 100000, req = { root: "/repo", path: "src/a.js", ts: now - 10 };
assert.deepEqual(toggleToApply(req, null, "/repo", now), { path: "src/a.js", seen: req.ts }, "applies a fresh Mark reviewed request from the pane and remembers it");
assert.deepEqual(toggleToApply(req, req.ts, "/repo", now), { path: null, seen: req.ts }, "applies each request once");
assert.deepEqual(toggleToApply({ ...req, ts: now - TOGGLE_TTL_MS - 1 }, null, "/repo", now).path, null, "ignores an old request left in shared state");
assert.deepEqual(toggleToApply(req, null, "/other", now), { path: null, seen: req.ts }, "ignores a request for another folder, once");
assert.deepEqual(toggleToApply(null, 5, "/repo", now), { path: null, seen: 5 }, "no request, nothing to apply");

console.log("my-changes review pane: all checks passed");
