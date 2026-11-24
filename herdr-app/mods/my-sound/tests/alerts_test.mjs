import assert from "node:assert/strict";
import { alertFor } from "../alerts.js";

assert.equal(alertFor("working", "done", "")?.sound, "done", "an agent that finishes dings");
assert.equal(alertFor("working", "idle", undefined)?.sound, "done", "going straight to idle counts as finishing");
assert.equal(alertFor("working", "done", "coordinator")?.sound, "done", "a coordinator dings when it finishes");
assert.equal(alertFor("working", "done", "child"), null, "a finished child is quiet");
assert.equal(alertFor("working", "blocked", "")?.sound, "blocked", "a blocked agent asks for you");
assert.equal(alertFor("working", "blocked", "child")?.sound, "blocked", "a blocked child still asks: nobody else can answer it");
assert.equal(alertFor("blocked", "blocked", ""), null, "staying blocked does not ding again");
assert.equal(alertFor("idle", "working", ""), null, "starting work is silent");
assert.equal(alertFor(undefined, "done", ""), null, "an agent seen for the first time is silent");
assert.equal(alertFor("done", "idle", ""), null, "done settling to idle is not a second finish");

console.log("my-sound alerts: all checks passed");
