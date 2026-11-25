import assert from "node:assert/strict";
import { capNotes, controllerText, foldLedger, ledgerSummary, spaceDir } from "../knowledge.js";

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

const control = (...events) => foldLedger(events.map((e) => line({ name: "k", ...e })).join("\n"))[0];
const spawned = control({ event: "spawn", coord: "t1" });
assert.deepEqual([spawned.controller, spawned.owner], ["t1", ""], "a spawned child is controlled by the coordinator that spawned it");
const lent = control({ event: "spawn", coord: "t1" }, { event: "lend", coord: "t1", to: "t2", from: "t1" });
assert.deepEqual([lent.controller, lent.owner], ["t2", "t1"], "a lent child is controlled by the borrower and owned by the lender");
const kept = control({ event: "spawn", coord: "t1" }, { event: "lend", coord: "t1", to: "t2", from: "t1" }, { event: "review", coord: "t2", verdict: "approved" });
assert.deepEqual([kept.controller, kept.owner], ["t2", "t1"], "a review does not change who controls a lent child");
const returned = control({ event: "spawn", coord: "t1" }, { event: "lend", coord: "t1", to: "t2", from: "t1" }, { event: "return", coord: "t2", to: "t1", from: "t2" });
assert.deepEqual([returned.controller, returned.owner], ["t1", ""], "a returned child goes back to its owner and is no longer lent");
const adopted = control({ event: "spawn", coord: "t1" }, { event: "lend", coord: "t1", to: "t2", from: "t1" }, { event: "adopt", coord: "t3" });
assert.deepEqual([adopted.controller, adopted.owner], ["t3", ""], "an adopt after a lend gives the child to the adopter and clears the owner");
const again = control({ event: "spawn", coord: "t1" }, { event: "lend", coord: "t1", to: "t2", from: "t1" }, { event: "spawn", coord: "t4" });
assert.deepEqual([again.controller, again.owner], ["t4", ""], "a respawned child starts with its new coordinator");
assert.equal(controllerText(spawned), "coord t1", "the knowledge view names a child's controller");
assert.equal(controllerText(lent), "coord t2, lent by t1", "and its lender while it is lent");

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
