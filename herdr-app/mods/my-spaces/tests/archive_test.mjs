import assert from "node:assert/strict";
import { parseArchive, setArchived, splitSpaces, nextAfter } from "../archive.js";

const spaces = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (list) => list.map((s) => s.id);

const archived = setArchived([], "b", true);
assert.deepEqual(ids(splitSpaces(spaces, archived).active), ["a", "c", "d"], "an archived space leaves the main list");
assert.deepEqual(ids(splitSpaces(spaces, archived).archived), ["b"], "an archived space joins the archived section");

assert.deepEqual(ids(splitSpaces(spaces, setArchived(archived, "b", false)).active), ["a", "b", "c", "d"], "resuming a space puts it back");
assert.deepEqual(setArchived(archived, "b", true), ["b"], "archiving twice keeps one entry");

for (const bad of [null, undefined, "", "{", "[]", '{"spaces":"b"}', '{"spaces":null}']) {
  assert.deepEqual(parseArchive(bad), [], `a damaged archive file archives nothing: ${bad}`);
}
assert.deepEqual(parseArchive('{"spaces":["a",3,null,"a","b"]}'), ["a", "b"], "entries that are not strings are ignored");

assert.equal(nextAfter(spaces, ["b"], "b"), "c", "archiving the active space selects the next one");
assert.equal(nextAfter(spaces, ["c", "d"], "d"), "b", "archiving the last space selects the one before, skipping archived");
assert.equal(nextAfter(spaces, ["b", "c"], "b"), "d", "archiving skips spaces that are already archived");
assert.equal(nextAfter([{ id: "a" }], ["a"], "a"), null, "with nothing else open there is nothing to select");
console.log("ok");
