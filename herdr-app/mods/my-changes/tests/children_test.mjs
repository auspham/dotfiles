import assert from "node:assert/strict";
import { childrenOf } from "../children.js";

const terminal = (address, labels) => ({ address, labels });
const all = [
  terminal("t1", { role: "coordinator" }),
  terminal("t2", { role: "child", coord: "t1", task: "login-fix", branch: "agent/login-fix" }),
  terminal("t3", { role: "child", coord: "t9", task: "other" }),
  terminal("t4", {}),
];
assert.deepEqual(childrenOf(all, "t1"), [{ address: "t2", task: "login-fix", branch: "agent/login-fix", yours: false }], "only this coordinator's children");
assert.equal(childrenOf([terminal("t6", { role: "child", coord: "t1", review: "yours" })], "t1")[0].yours, true, "a review that is the user's is marked");
assert.deepEqual(childrenOf(all, "t4"), [], "an ordinary agent has none");
assert.equal(childrenOf([terminal("t5", { role: "child", coord: "t1" })], "t1")[0].task, "t5", "a child without a task is named by its terminal");

console.log("my-changes children: all checks passed");
