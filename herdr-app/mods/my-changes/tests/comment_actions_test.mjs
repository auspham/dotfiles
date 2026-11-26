import assert from "node:assert/strict";
import { clickBlock } from "../comment_actions.js";
import { threadBlocks } from "../comment_layout.js";
import { threadCard } from "../comment_card.js";
import { newThread, patchLast } from "../comment_threads.js";

const anchor = { lines: [{ side: "new", n: 3, text: "let x = 2" }], before: [], after: [] };
const queued = newThread({ id: "cabc123", path: "a.js", anchor, q: "Why is this two?", now: 1 });
const answered = patchLast([queued], queued.id, { status: "done", a: "Because." })[0];
const keys = Object.fromEntries(threadBlocks(answered, threadCard(answered, 600, { collapsed: false, outdated: false, expanded: false, names: {} }), 3).map((b) => [b.part, `unified${b.key}`]));

/** A Changes view with only what clickBlock reaches, recording what it was asked to do. @param {any} composer */
function fakeHost(composer = null) {
  const calls = [];
  const input = { value: "", set_value(v) { input.value = v; }, focus() { calls.push("focus input"); } };
  const host = {
    root: "/repo", open: "a.js", composer, commentInput: input, hasComment: false,
    handle: { focus() { calls.push("focus view"); } },
    comments: { find: (id) => (id === answered.id ? answered : null), act: (op, spec) => calls.push(`${op} ${spec.id}`), toggle: (id) => calls.push(`toggle ${id}`) },
    publishComments() {},
  };
  return { host, calls };
}
const cx = { notify() {} };

let { host, calls } = fakeHost();
assert.equal(clickBlock(host, keys.resolve, cx), true, "the Resolve row is a block's key");
assert.deepEqual([calls.includes(`resolve ${answered.id}`), host.composer], [true, null], "a click on the Resolve row resolves the thread without opening the bar");

({ host, calls } = fakeHost());
clickBlock(host, keys.resolve, cx, true);
assert.deepEqual([calls.some((c) => c.startsWith("resolve")), host.composer], [false, { mode: "thread", id: answered.id }], "a right-click on the Resolve row opens the thread instead of resolving it");

({ host, calls } = fakeHost());
clickBlock(host, keys.foot, cx);
assert.deepEqual([host.composer, calls], [{ mode: "thread", id: answered.id }, ["focus input"]], "a click on the reply box opens the thread in the bar with its input focused");

({ host, calls } = fakeHost());
clickBlock(host, keys.head, cx);
assert.deepEqual([host.composer, calls], [null, [`toggle ${answered.id}`]], "a click on the header still folds the thread and leaves the bar shut");

const typing = { mode: "new", anchor };
({ host, calls } = fakeHost(typing));
host.commentInput.value = "half a comment";
clickBlock(host, keys.resolve, cx);
assert.deepEqual([host.composer, host.commentInput.value], [typing, "half a comment"], "resolving a card keeps a comment typed in the bar for other lines");

({ host, calls } = fakeHost({ mode: "thread", id: answered.id }));
clickBlock(host, keys.resolve, cx);
assert.equal(host.composer, null, "resolving the thread the bar is on closes the bar, as the bar's Resolve does");

console.log("my-changes comment actions: all checks passed");
