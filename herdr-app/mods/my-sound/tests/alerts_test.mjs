import assert from "node:assert/strict";
import { alertFor, isQuiet, parseArchived, reviewAlert } from "../alerts.js";

assert.equal(alertFor({ before: "working", now: "done", role: "" })?.sound, "done", "an agent that finishes dings");
assert.equal(alertFor({ before: "working", now: "idle", role: undefined })?.sound, "done", "going straight to idle counts as finishing");
assert.equal(alertFor({ before: "working", now: "done", role: "coordinator", turn: "user" })?.sound, "done", "a coordinator dings when it finishes a turn the user started");
assert.equal(alertFor({ before: "working", now: "idle", role: "coordinator", turn: "peer" }), null, "a coordinator is quiet after a turn a child's message started");
assert.equal(alertFor({ before: "working", now: "blocked", role: "coordinator", turn: "peer" })?.sound, "blocked", "a blocked coordinator asks for you whoever started the turn");
assert.equal(alertFor({ before: "working", now: "done", role: "", turn: "peer" })?.sound, "done", "an agent outside a team dings whoever started the turn");
assert.equal(alertFor({ before: "working", now: "done", role: "child" }), null, "a finished child is quiet");
assert.equal(alertFor({ before: "working", now: "blocked", role: "" })?.sound, "blocked", "a blocked agent asks for you");
assert.equal(alertFor({ before: "working", now: "blocked", role: "child" })?.sound, "blocked", "a blocked child still asks: nobody else can answer it");
assert.equal(alertFor({ before: "blocked", now: "blocked", role: "" }), null, "staying blocked does not ding again");
assert.equal(alertFor({ before: "idle", now: "working", role: "" }), null, "starting work is silent");
assert.equal(alertFor({ before: undefined, now: "done", role: "" }), null, "an agent seen for the first time is silent");
assert.equal(alertFor({ before: "done", now: "idle", role: "" }), null, "done settling to idle is not a second finish");

assert.equal(reviewAlert("reviewing", "yours", "fix-x")?.sound, "done", "a handoff to you dings");
assert.equal(reviewAlert("pending", "yours", "fix-x")?.name, "fix-x", "the handoff toast names the task");
assert.equal(reviewAlert("yours", "yours", "fix-x"), null, "a handoff dings only once");
assert.equal(reviewAlert(undefined, "yours", "fix-x"), null, "a child first seen already handed off is silent");
assert.equal(reviewAlert("yours", "approved", "fix-x"), null, "other review changes are silent");

const archived = parseArchived('{"spaces":["s1"]}');
assert.equal(isQuiet("s1", archived), true, "an agent in an archived space makes no sound");
assert.equal(isQuiet("s2", archived), false, "an agent elsewhere still dings");
for (const bad of [null, "", "{nope", "[]", '{"spaces":"s1"}'])
  assert.equal(parseArchived(bad).size, 0, `a damaged archive file archives nothing: ${bad}`);
assert.deepEqual([...parseArchived('{"spaces":["s1",3,null]}')], ["s1"], "entries that are not strings are ignored");

console.log("my-sound alerts: all checks passed");
