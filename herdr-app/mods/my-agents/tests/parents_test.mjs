import assert from "node:assert/strict";
import { parentOf, isLent, displayName, lentNote } from "../parents.js";

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

const all = [{ address: "t1", name: null, labels: { role: "coordinator" } }, { address: "t3", name: null }];
const names = new Map([["t1", "austin-c6"], ["t5", "signed-out-badge"], ["t6", "4"]]);
assert.equal(displayName(child({ task: "x" }), names), "signed-out-badge", "a child goes by the label its own agent row would show");
assert.equal(displayName({ address: "t6", labels: { task: "fix-login" } }, names), "fix-login", "an automatic tab number gives way to the task label");
assert.equal(displayName({ address: "t8", labels: { task: "fix-login" } }, names), "fix-login", "a child without an agent row goes by its task label");
assert.equal(displayName({ address: "t8", name: "worker", labels: {} }, names), "worker", "without a task the terminal's own name is used");
assert.equal(displayName({ address: "t8", program: { name: "claude" } }, names), "claude", "then its program");
assert.equal(displayName({ address: "t8" }, names), "t8", "and last its address");

assert.equal(lentNote(child({ owner: "t1" }), all, names), "Lent by austin-c6", "the note names the owner as its agent row does");
assert.equal(lentNote(child({ owner: "t3" }), all, names), "Lent by t3", "an owner without any name is named by its terminal");
assert.equal(lentNote(child({ owner: "t7" }), all, names), "Lent by t7", "an owner that is gone is named by its terminal");
assert.equal(lentNote(child({}), all, names), null, "a child that is not lent has no note");
console.log("my-agents parents: all checks passed");
