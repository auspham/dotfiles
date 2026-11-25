import assert from "node:assert/strict";
import { alertFor, isQuiet, parseArchived } from "../alerts.js";

assert.equal(alertFor({ before: "working", now: "done", role: "" })?.sound, "done", "an agent that finishes dings");
assert.equal(alertFor({ before: "working", now: "idle", role: undefined })?.sound, "done", "going straight to idle counts as finishing");
assert.equal(alertFor({ before: "working", now: "done", role: "coordinator" })?.sound, "done", "a coordinator dings when it finishes");
assert.equal(alertFor({ before: "working", now: "done", role: "child" }), null, "a finished child is quiet");
assert.equal(alertFor({ before: "working", now: "blocked", role: "" })?.sound, "blocked", "a blocked agent asks for you");
assert.equal(alertFor({ before: "working", now: "blocked", role: "child" })?.sound, "blocked", "a blocked child still asks: nobody else can answer it");
assert.equal(alertFor({ before: "blocked", now: "blocked", role: "" }), null, "staying blocked does not ding again");
assert.equal(alertFor({ before: "idle", now: "working", role: "" }), null, "starting work is silent");
assert.equal(alertFor({ before: undefined, now: "done", role: "" }), null, "an agent seen for the first time is silent");
assert.equal(alertFor({ before: "done", now: "idle", role: "" }), null, "done settling to idle is not a second finish");

const archived = parseArchived('{"spaces":["s1"]}');
assert.equal(isQuiet("s1", archived), true, "an agent in an archived space makes no sound");
assert.equal(isQuiet("s2", archived), false, "an agent elsewhere still dings");
for (const bad of [null, "", "{nope", "[]", '{"spaces":"s1"}'])
  assert.equal(parseArchived(bad).size, 0, `a damaged archive file archives nothing: ${bad}`);
assert.deepEqual([...parseArchived('{"spaces":["s1",3,null]}')], ["s1"], "entries that are not strings are ignored");

console.log("my-sound alerts: all checks passed");
