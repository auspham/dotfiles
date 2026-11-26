import assert from "node:assert/strict";
import { liveChildren, agentCount, closeToast } from "../close.js";

const t = (address, labels, state = "live") => ({ address, state, labels });
const all = [
  t("t1", { role: "coordinator" }),
  t("t2", { role: "child", coord: "t1" }),
  t("t3", { role: "child", coord: "t1", owner: "t9" }),
  t("t4", { role: "child", coord: "t9", owner: "t1" }),
  t("t5", { role: "child", coord: "t1" }, "finished"),
  { address: "t6", state: "live", parent: "t1" },
  t("t7", { role: "coordinator", coord: "t1" }),
];
assert.equal(liveChildren(all, "t1"), 2, "a coordinator's live children count, a borrowed one included");
assert.equal(liveChildren(all, "t9"), 1, "a lent-out child counts for the borrower, not the owner");
assert.equal(liveChildren(all, "t8"), 0, "a coordinator without children has none");

assert.equal(agentCount(1), "1 agent", "one agent is singular");
assert.equal(agentCount(3), "3 agents", "more are plural");
assert.equal(agentCount(0), "0 agents", "none is plural");

const clean = closeToast({ code: 0, stderr: "", stdout: "removed the worktree of a; branch agent/a is kept\nclosed the coordinator and 1 agents; every agent/* branch is kept\n" });
assert.deepEqual(clean, { title: "Closed the coordinator and 1 agent", body: "Removed their worktrees. Branches are kept.", level: "success" }, "a clean close says the worktrees went");

const kept = closeToast({ code: 0, stderr: "", stdout: [
  "removed the worktree of a; branch agent/a is kept",
  "kept the worktree of b at /r/.agent-worktrees/b: uncommitted changes",
  "kept the worktree of c at /r/.agent-worktrees/c: git could not remove it",
  "closed the coordinator and 3 agents; every agent/* branch is kept",
].join("\n") });
assert.equal(kept.level, "warning", "kept worktrees are a warning");
assert.equal(kept.title, "Closed the coordinator and 3 agents", "the title counts the agents closed");
assert.equal(kept.body, "Kept b (uncommitted changes), c (git could not remove it). Branches are kept.", "the body names each kept worktree and why");
const same = closeToast({ code: 0, stderr: "", stdout: "kept the worktree of b at /r/b: uncommitted changes\nkept the worktree of c at /r/c: uncommitted changes\nclosed the coordinator and 2 agents; every agent/* branch is kept\n" });
assert.equal(same.body, "Kept b, c: uncommitted changes. Branches are kept.", "a reason they share is said once, after the names");

assert.deepEqual(closeToast({ code: 1, stdout: "", stderr: "hcoord: t2 is not a coordinator\n" }), { title: "Could not close the coordinator", body: "t2 is not a coordinator", level: "error" }, "a refusal shows hcoord's reason");
assert.equal(closeToast({ code: 2, stdout: "", stderr: "" }).body, "hcoord exited with 2", "a silent failure says how it exited");
console.log("my-agents close: all checks passed");
