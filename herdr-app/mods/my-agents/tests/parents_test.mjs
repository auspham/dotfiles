import assert from "node:assert/strict";
import { parentOf, isLent, lentNote } from "../parents.js";

const child = (labels, extra = {}) => ({ address: "t5", parent: null, labels: { role: "child", ...labels }, ...extra });

assert.equal(parentOf(child({ coord: "t1" })), "t1", "a child nests under the coordinator that controls it");
assert.equal(parentOf(child({ coord: "t2", owner: "t1" })), "t2", "a lent child moves under the borrower");
assert.equal(parentOf(child({ coord: "" }, { parent: "t9" })), "t9", "a child without a coord falls back to its herdr parent");
assert.equal(parentOf({ address: "t5", parent: "t9", labels: { role: "coordinator", coord: "t1" } }), "t9", "only children follow the coord label");
assert.equal(parentOf({ address: "t5", parent: "t9" }), "t9", "a terminal without labels keeps its herdr parent");
assert.equal(parentOf({ address: "t5" }), null, "a terminal with no parent is top level");
assert.equal(parentOf(child({ coord: "t5" })), null, "a child whose coord names itself is top level");

assert.equal(isLent(child({ coord: "t2", owner: "t1" })), true, "a child with an owner is lent");
assert.equal(isLent(child({ coord: "t2", owner: "" })), false, "an empty owner means not lent");
assert.equal(isLent({ address: "t5" }), false, "a terminal without labels is not lent");

const all = [{ address: "t1", name: "austin-c6" }, { address: "t3", name: "" }];
assert.equal(lentNote(child({ owner: "t1" }), all), "Lent by austin-c6", "the note names the owner by its display name");
assert.equal(lentNote(child({ owner: "t3" }), all), "Lent by t3", "an owner without a name is named by its terminal");
assert.equal(lentNote(child({ owner: "t7" }), all), "Lent by t7", "an owner that is gone is named by its terminal");
assert.equal(lentNote(child({}), all), null, "a child that is not lent has no note");
console.log("my-agents parents: all checks passed");
