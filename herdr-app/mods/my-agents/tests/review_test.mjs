import assert from "node:assert/strict";
import { reviewState } from "../review.js";

const handed = (review) => ({ address: "t5", labels: { role: "child", review } });

assert.equal(reviewState(handed("yours"), "idle"), "review", "an idle child handed to the user asks for review");
assert.equal(reviewState(handed("yours"), "done"), "review", "a done child handed to the user asks for review");
assert.equal(reviewState(handed("yours"), "working"), "working", "a working child shows working even while handed over");
assert.equal(reviewState(handed("yours"), "blocked"), "blocked", "a blocked child shows blocked even while handed over");
assert.equal(reviewState(handed("reviewed"), "idle"), "idle", "a child the user already reviewed shows its normal status");
assert.equal(reviewState({ address: "t5" }, "idle"), "idle", "a terminal without labels shows its normal status");
assert.equal(reviewState(undefined, "idle"), "idle", "an agent with no terminal shows its normal status");
console.log("my-agents review: all checks passed");
