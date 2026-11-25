import assert from "node:assert/strict";
import { childrenOf, reviewQueue } from "../children.js";

const terminal = (address, labels) => ({ address, labels });
const all = [
  terminal("t1", { role: "coordinator" }),
  terminal("t2", { role: "child", coord: "t1", task: "login-fix", branch: "agent/login-fix" }),
  terminal("t3", { role: "child", coord: "t9", task: "other" }),
  terminal("t4", {}),
];
assert.deepEqual(childrenOf(all, "t1"), [{ address: "t2", task: "login-fix", branch: "agent/login-fix", yours: false, reviewed: false }], "only this coordinator's children");
assert.equal(childrenOf([terminal("t6", { role: "child", coord: "t1", review: "yours" })], "t1")[0].yours, true, "a review that is the user's is marked");
assert.deepEqual(childrenOf(all, "t4"), [], "an ordinary agent has none");
assert.equal(childrenOf([terminal("t5", { role: "child", coord: "t1" })], "t1")[0].task, "t5", "a child without a task is named by its terminal");

const kid = (address, review) => ({ address, task: address, branch: "", yours: review === "yours", reviewed: review === "reviewed" });
const queue = reviewQueue([kid("t1", "reviewed"), kid("t2", "yours"), kid("t3", ""), kid("t4", "yours")]);
assert.deepEqual(queue.waiting.map((k) => k.address), ["t2", "t4"], "children waiting for the user's review come first, in their order");
assert.deepEqual(queue.rest.map((k) => k.address), ["t1", "t3"], "the other children follow");
assert.equal(queue.heading, "Waiting for your review (2)", "the heading counts the children waiting for the user");
assert.deepEqual(queue.rest.map((k) => k.chip), ["Reviewed by you", ""], "only a reviewed child gets the Reviewed by you chip");
assert.equal(reviewQueue([kid("t1", "reviewed")]).heading, "Nothing is waiting for your review", "the heading says so when nothing is waiting");

console.log("my-changes children: all checks passed");
