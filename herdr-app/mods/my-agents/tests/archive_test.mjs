import assert from "node:assert/strict";
import { parseArchived, splitArchived, archivedLabel } from "../archive.js";

const agents = [{ address: "a", space: "s1" }, { address: "b", space: "s2" }, { address: "c", space: "s1" }];
const { live, hidden } = splitArchived(agents, parseArchived('{"spaces":["s1"]}'));
assert.deepEqual(live.map((a) => a.address), ["b"], "an archived space's agents leave the main list");
assert.deepEqual(hidden.map((a) => a.address), ["a", "c"], "they are kept for the archived row");

for (const bad of [null, "", "{nope", "[]", '{"spaces":"s1"}', '{"spaces":null}'])
  assert.equal(parseArchived(bad).size, 0, `a damaged archive file archives nothing: ${bad}`);
assert.deepEqual([...parseArchived('{"spaces":["s1",3,null,{}]}')], ["s1"], "entries that are not strings are ignored");
assert.equal(splitArchived(agents, new Set()).live.length, 3, "nothing archived leaves everything");
assert.equal(archivedLabel(1), "Archived · 1 agent");
assert.equal(archivedLabel(2), "Archived · 2 agents");
console.log("my-agents archive: all checks passed");
