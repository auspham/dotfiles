import assert from "node:assert/strict";
import { capNotes, foldLedger, ledgerSummary, spaceDir } from "../knowledge.js";

const line = (o) => JSON.stringify({ at: "2026-01-01T00:00:00Z", coord: "c", space: "s", ...o });
const ledger = [
  line({ event: "spawn", name: "a", task: "first line\nsecond", branch: "agent/a" }),
  line({ event: "spawn", name: "b", task: "other", branch: "agent/b" }),
  line({ event: "review", name: "a", verdict: "approved", note: "good" }),
  line({ event: "kill", name: "b", worktree_removed: true }),
  line({ event: "spawn", name: "c", task: "third", branch: "agent/c" }),
].join("\n");

const folded = foldLedger(ledger);
const by = (name) => folded.find((c) => c.name === name);
assert.deepEqual(folded.map((c) => c.name), ["a", "b", "c"], "the ledger folds to one entry per child");
assert.equal(by("a").event, "review", "the ledger folds to each child's latest state");
assert.equal(by("c").event, "spawn");
assert.equal(by("a").branch, "agent/a");
assert.equal(by("a").task.split("\n")[0], "first line");

const damaged = foldLedger(`{ nope\n\n${line({ event: "spawn", name: "x" })}\n[1]\n{"event":"kill"}`);
assert.deepEqual(damaged.map((c) => c.name), ["x"], "a damaged ledger line is skipped");

assert.equal(by("b").killed, true, "a killed child is marked killed");
assert.equal(by("a").killed, false);
assert.equal(by("b").branch, "agent/b", "a killed child keeps its branch");

assert.equal(by("a").verdict, "approved", "a review verdict is kept");
assert.equal(by("a").note, "good");
const later = foldLedger(`${ledger}\n${line({ event: "adopt", name: "a", terminal: "t9" })}`);
assert.equal(later.find((c) => c.name === "a").verdict, "approved", "a review verdict survives a later event");
const respawned = foldLedger(`${ledger}\n${line({ event: "spawn", name: "b", task: "again" })}`);
assert.equal(respawned.find((c) => c.name === "b").killed, false, "a respawned child is no longer killed");

assert.equal(ledgerSummary(folded), "3 children, 1 killed", "the summary counts children and killed");
assert.equal(ledgerSummary(foldLedger(line({ event: "spawn", name: "a" }))), "1 child");
assert.equal(ledgerSummary(null), "", "no ledger gives no summary");

assert.equal(capNotes("  \n"), null, "blank notes read as no notes");
assert.equal(capNotes(null), null);
assert.equal(capNotes("x".repeat(5000)).length, 4001, "long notes are cut");
assert.equal(capNotes("short"), "short");

assert.equal(spaceDir("/h", "w_1"), "/h/.claude/coordinator/spaces/w_1", "the space folder sits under the knowledge space");
assert.equal(spaceDir("/h", "../x"), null, "an id that could escape is refused");
assert.equal(spaceDir("/h", ".."), null);
assert.equal(spaceDir("/h", undefined), null);
console.log("knowledge_test ok");
