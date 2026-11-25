import assert from "node:assert/strict";
import { newThread, addReply, patchLast, setResolved, removeThread, lastOf, waiting, settleAfterReload, parseThreads, threadId } from "../comment_threads.js";
import { parseReplies, applyReplies, repliesPath, listening } from "../comment_replies.js";
import { pickTarget, commentNote, commentPath, agentLine, claudePrompt } from "../comment_prompt.js";
import { parseShared, parseRequest, requestToApply, threadsKey } from "../comment_share.js";
import { TOGGLE_TTL_MS } from "../review_pane.js";

const anchor = { lines: [{ side: "new", n: 3, text: "let x = 2" }], before: ["import a"], after: [] };
const agent = { address: "t7", name: "fixer" };
const t0 = newThread({ id: "cabc123", path: "src/a.js", anchor, q: "Why 2?", now: 1000 });

assert.match(threadId(() => 0.5), /^c[0-9a-z]{6}$/, "makes a short id an agent can type back");
assert.equal(lastOf(t0).status, "pending", "a new comment waits for its answer");
assert.ok(waiting(t0), "a new thread is waiting");
const sent = patchLast([t0], t0.id, { status: "sent", to: agent })[0];
const replied = addReply([setResolved([sent], t0.id, true)[0]], t0.id, "And y?", 2000)[0];
assert.equal(replied.exchanges.length, 2, "a reply adds a follow-up to the same thread");
assert.equal(replied.resolved, false, "a reply reopens a resolved thread");
assert.deepEqual(removeThread([t0, replied], t0.id), [], "deleting removes the thread");

const settled = settleAfterReload([t0, sent]);
assert.equal(lastOf(settled[0]).status, "error", "a claude answer cut off by a reload shows as an error");
assert.equal(lastOf(settled[1]).status, "sent", "a comment already sent to an agent still waits for its reply after a reload");

const stored = JSON.parse(JSON.stringify([t0, replied, { ...t0, id: "bad id" }, { ...t0, id: "cdup" }, { ...t0, id: "cdup" }]));
assert.deepEqual(parseThreads(stored).map((t) => t.id), ["cabc123", "cdup"], "drops bad and repeated threads read back from storage");
assert.deepEqual(parseThreads("nope"), [], "a non-list reads as no threads");
assert.equal(parseThreads([{ ...t0, exchanges: [{ ...lastOf(t0), status: "lost" }] }]).length, 0, "a thread with an unknown status is rejected");

const lines = [JSON.stringify({ id: "cabc123", text: "Because tests.", from: "t7", at: 1 }), "{partial", JSON.stringify({ id: "cabc123", text: "x", from: "t9", at: 2 }), JSON.stringify({ id: "cabc123", text: "Also y.", from: "t7", at: 3 })].join("\n");
const replies = parseReplies(lines);
assert.equal(replies.length, 3, "skips lines that are not well-formed replies");
const once = applyReplies([sent], replies.slice(0, 1));
assert.equal(lastOf(once.threads[0]).a, "Because tests.", "an agent's reply answers its thread");
assert.equal(lastOf(once.threads[0]).status, "done", "a reply ends the wait");
const all = applyReplies(once.threads, replies);
assert.equal(lastOf(all.threads[0]).a, "Because tests.\n\nAlso y.", "a thread can get several replies, and a reply from another terminal is ignored");
assert.equal(applyReplies(all.threads, replies).changed, false, "reading the same file again adds nothing twice");
assert.equal(applyReplies([t0], replies).threads[0].exchanges[0].a, "", "a thread answered by claude takes no agent replies");
assert.ok(listening(once.threads), "keeps reading replies after the first answer, since an agent may send several");
assert.equal(listening([t0]), false, "a thread answered by claude needs no replies file");
assert.equal(repliesPath("/s"), "/s/herdr-review/replies.jsonl", "replies live under the state folder");

const live = { address: "t7", state: "live", status: "working", name: "fixer", title: "claude", cwd: "/repo/wt", labels: { "claude.session": "s1" } };
assert.deepEqual(pickTarget(live, "/repo/wt"), { kind: "agent", address: "t7", name: "fixer" }, "sends to the live agent working in this folder");
assert.deepEqual(pickTarget({ ...live, state: "exited" }, "/repo/wt"), { kind: "claude", session: "s1" }, "a gone agent's session is forked by claude -p");
assert.deepEqual(pickTarget({ ...live, cwd: "/elsewhere" }, "/repo/wt"), { kind: "claude", session: "s1" }, "an agent in another folder does not own the view");
assert.deepEqual(pickTarget(null, "/repo"), { kind: "claude", session: null }, "without a terminal, claude -p answers afresh");
const note = "/s/herdr-review/comments/cabc123.md";
assert.equal(commentPath("/s", "cabc123"), note, "each thread's comment is written to its own file under the state folder");
const line = agentLine(replied, note);
assert.ok(!/[\r\n]/.test(line), "the text typed into the agent is one line, since each newline would press Enter");
assert.match(line, /^\[Review comment cabc123\] Read \/s\/herdr-review\/comments\/cabc123\.md, /, "the typed line points the agent at the comment file");
assert.match(line, /hreview reply cabc123 "<your answer>"/, "the agent is told how to answer this thread");
assert.match(commentNote(replied), /src\/a\.js, line 3:\n```diff\n\+    3 \| let x = 2/, "the comment file quotes the anchored lines");
assert.match(commentNote(replied), /Earlier in this thread:\nComment: Why 2\?/, "a follow-up's file carries the thread's earlier exchanges");
assert.match(commentNote(replied), /Follow-up: And y\?$/, "the comment file ends with the newest comment");
assert.match(claudePrompt(t0), /src\/a\.js, line 3:\n```diff\n\+    3 \| let x = 2/, "the prompt quotes the anchored lines");

assert.equal(threadsKey("A"), "review.threads.A", "each tab has its own threads key");
assert.deepEqual(parseShared({ root: "/r", path: "src/a.js", threads: [t0] }, "/r", "src/a.js"), [t0], "the pane takes threads for the file it shows");
assert.equal(parseShared({ root: "/r", path: "b.js", threads: [t0] }, "/r", "src/a.js"), null, "the pane ignores threads for another file");
const now = 100000, req = { op: "add", root: "/r", path: "src/a.js", anchor, text: "hi", ts: now - 5 };
assert.deepEqual(requestToApply(req, null, "/r", now), { request: req, seen: req.ts }, "applies a fresh comment from the pane");
assert.equal(requestToApply(req, req.ts, "/r", now).request, null, "applies each request once");
assert.equal(requestToApply({ ...req, ts: now - TOGGLE_TTL_MS - 1 }, null, "/r", now).request, null, "ignores an old request left in shared state");
assert.equal(parseRequest({ ...req, op: "explode" }), null, "rejects an unknown request");
assert.equal(parseRequest({ op: "resolve", root: "/r", path: "a", text: "", ts: 1 }), null, "a thread request must name its thread");

console.log("my-changes comment threads: all checks passed");
