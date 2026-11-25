import assert from "node:assert/strict";
import { newThread, addReply, patchLast, patchMany, editDraft, discardDraft, isDraft, setResolved, removeThread, lastOf, waiting, settleAfterReload, parseThreads, threadId, storeKey, loadThreads } from "../comment_threads.js";
import { draftsOf, stillThere, batchPath, batchNote, batchLine, sentSuffix } from "../comment_batch.js";
import { parseReplies, applyReplies, repliesPath, listening } from "../comment_replies.js";
import { pickTarget, commentNote, claudePrompt } from "../comment_prompt.js";
import { parseShared, parseRequest, requestToApply, threadsKey } from "../comment_share.js";
import { TOGGLE_TTL_MS } from "../review_pane.js";

const anchor = { lines: [{ side: "new", n: 3, text: "let x = 2" }], before: ["import a"], after: [] };
const agent = { address: "t7", name: "fixer" };
const t0 = newThread({ id: "cabc123", path: "src/a.js", anchor, q: "Why 2?", now: 1000 });

assert.match(threadId(() => 0.5), /^c[0-9a-z]{6}$/, "makes a short id an agent can type back");
assert.equal(lastOf(t0).status, "draft", "a new comment is saved as a draft, not sent");
assert.equal(waiting(t0), false, "a draft waits on no answer, so it can still be edited");
const sent = patchLast([t0], t0.id, { status: "sent", to: agent })[0];
const replied = addReply([setResolved([sent], t0.id, true)[0]], t0.id, "And y?", 2000)[0];
assert.equal(replied.exchanges.length, 2, "a reply adds a follow-up to the same thread");
assert.equal(replied.resolved, false, "a reply reopens a resolved thread");
assert.deepEqual(removeThread([t0, replied], t0.id), [], "deleting removes the thread");

assert.equal(lastOf(replied).status, "draft", "a reply is saved as a draft too");
const settled = settleAfterReload([patchLast([t0], t0.id, { status: "pending" })[0], sent, t0]);
assert.equal(lastOf(settled[0]).status, "error", "a claude answer cut off by a reload shows as an error");
assert.equal(lastOf(settled[1]).status, "sent", "a comment already sent to an agent still waits for its reply after a reload");
assert.equal(lastOf(settled[2]).status, "draft", "a draft stays unsent after a reload");
const heldBack = settleAfterReload(patchLast([t0], t0.id, { status: "held", to: agent }))[0];
assert.deepEqual([lastOf(heldBack).status, lastOf(heldBack).to], ["draft", null], "a comment held for a busy agent goes back to a draft after a reload, to send again");
assert.equal(parseThreads(JSON.parse(JSON.stringify([t0])))[0].exchanges[0].status, "draft", "a draft survives being stored and read back");

assert.equal(lastOf(editDraft([t0], t0.id, "Why not 3?")[0]).q, "Why not 3?", "a draft can be edited before it is sent");
assert.equal(lastOf(editDraft([sent], t0.id, "Changed")[0]).q, "Why 2?", "a sent comment cannot be edited");
assert.deepEqual(discardDraft([t0], t0.id), [], "discarding a new thread's only draft removes the thread");
assert.deepEqual(discardDraft([replied], t0.id)[0].exchanges.map((e) => e.q), ["Why 2?"], "discarding a reply's draft keeps the thread's earlier comments");
assert.deepEqual(discardDraft([sent], t0.id), [sent], "a sent comment cannot be discarded");
assert.ok(isDraft(replied) && !isDraft(sent), "tells an unsent draft from a sent comment");

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
const followUp = addReply(all.threads, t0.id, "Then fix it?", 4000);
const late = parseReplies([lines, JSON.stringify({ id: "cabc123", text: "Committed abc.", from: "t7", at: 5 })].join("\n"));
const heard = applyReplies(followUp, late).threads[0];
assert.equal(heard.exchanges[0].a, "Because tests.\n\nAlso y.\n\nCommitted abc.", "a late reply joins the comment it answers, not a newer unsent draft");
assert.deepEqual([lastOf(heard).status, lastOf(heard).a], ["draft", ""], "an unsent draft never takes an answer");
assert.ok(listening(followUp), "keeps reading replies to a sent comment while a follow-up is only a draft");
const sentFollowUp = patchLast([heard], t0.id, { status: "sent", to: agent });
assert.equal(applyReplies(sentFollowUp, late).changed, false, "replies already heard do not answer the follow-up once it is sent");
assert.equal(repliesPath("/s"), "/s/herdr-review/replies.jsonl", "replies live under the state folder");

const live = { address: "t7", state: "live", status: "working", name: "fixer", title: "claude", cwd: "/repo/wt", labels: { "claude.session": "s1" } };
assert.deepEqual(pickTarget(live, "/repo/wt"), { kind: "agent", address: "t7", name: "fixer" }, "sends to the live agent working in this folder");
assert.deepEqual(pickTarget({ ...live, state: "exited" }, "/repo/wt"), { kind: "claude", session: "s1" }, "a gone agent's session is forked by claude -p");
assert.deepEqual(pickTarget({ ...live, cwd: "/elsewhere" }, "/repo/wt"), { kind: "claude", session: "s1" }, "an agent in another folder does not own the view");
assert.deepEqual(pickTarget(null, "/repo"), { kind: "claude", session: null }, "without a terminal, claude -p answers afresh");
assert.match(commentNote(replied), /src\/a\.js, line 3:\n```diff\n\+    3 \| let x = 2/, "the comment file quotes the anchored lines");
assert.match(commentNote(replied), /Earlier in this thread:\nComment: Why 2\?/, "a follow-up's file carries the thread's earlier exchanges");
assert.match(commentNote(replied), /Follow-up: And y\?$/, "the comment file ends with the newest comment");
assert.match(claudePrompt(t0), /src\/a\.js, line 3:\n```diff\n\+    3 \| let x = 2/, "the prompt quotes the anchored lines");

assert.equal(threadsKey("A"), "review.threads.A", "each tab has its own threads key");
assert.deepEqual(parseShared({ root: "/r", path: "src/a.js", threads: [t0], drafts: 3 }, "/r", "src/a.js"), { threads: [t0], drafts: 3 }, "the pane takes threads for the file it shows and the draft count for every file");
assert.equal(parseShared({ root: "/r", path: "src/a.js", threads: [], drafts: -1 }, "/r", "src/a.js").drafts, 0, "a bad draft count reads as none");
assert.equal(parseShared({ root: "/r", path: "b.js", threads: [t0] }, "/r", "src/a.js"), null, "the pane ignores threads for another file");
assert.equal(parseShared({ root: "/r", path: "src/a.js", threads: [{ ...t0, exchanges: [{ ...t0.exchanges[0], status: "draft" }] }] }, "/r", "src/a.js").drafts, 1, "counts the queued threads a published record carries when its draft count is missing");
const now = 100000, req = { op: "add", root: "/r", path: "src/a.js", anchor, text: "hi", ts: now - 5 };
assert.deepEqual(requestToApply(req, null, "/r", now), { request: req, seen: req.ts }, "applies a fresh comment from the pane");
assert.equal(requestToApply(req, req.ts, "/r", now).request, null, "applies each request once");
assert.equal(requestToApply({ ...req, ts: now - TOGGLE_TTL_MS - 1 }, null, "/r", now).request, null, "ignores an old request left in shared state");
assert.equal(parseRequest({ ...req, op: "explode" }), null, "rejects an unknown request");
assert.equal(parseRequest({ op: "resolve", root: "/r", path: "a", text: "", ts: 1 }), null, "a thread request must name its thread");
assert.deepEqual(parseRequest({ op: "send", root: "/r", path: "a", text: "", ts: 1 }), { op: "send", root: "/r", path: "a", text: "", ts: 1 }, "the pane can ask the panel to send the drafts without naming a thread");
assert.equal(parseRequest({ op: "edit", root: "/r", path: "a", thread: "cabc123", text: "x", ts: 1 }).op, "edit", "the pane can ask the panel to edit a draft");

const other = newThread({ id: "cdef456", path: "src/b.js", anchor, q: "Rename this?", now: 3000 });
const batch = draftsOf([t0, sent, other]);
assert.deepEqual(batch.map((t) => t.id), ["cabc123", "cdef456"], "Send takes every draft and leaves sent comments alone");
assert.deepEqual(stillThere([other], ["cabc123", "cdef456"]).map((t) => t.id), ["cdef456"], "a comment deleted while the agent was busy is left out of the batch");
assert.ok(lastOf(patchMany([t0, other], ["cabc123", "cdef456"], { status: "held", to: agent })[1]).to, "every comment in a batch is marked with the agent it goes to");
const path = batchPath("/s", 36);
assert.equal(path, "/s/herdr-review/comments/batch-10.md", "a batch is written to its own file under the state folder");
assert.notEqual(batchPath("/s", 37), path, "a second batch does not overwrite the first");
const file = batchNote([replied, other]);
assert.match(file, /^2 comments from the user's review\./, "the batch file says how many comments it holds");
assert.match(file, /## Thread cabc123\n\nReview comment cabc123\. On src\/a\.js, line 3:\n```diff\n\+    3 \| let x = 2/, "each comment in the file has its thread id, file, lines and diff");
assert.match(file, /Earlier in this thread:\nComment: Why 2\?[\s\S]*Follow-up: And y\?/, "a follow-up in the file carries its earlier exchanges and the new comment");
assert.match(file, /## Thread cdef456\n\nReview comment cdef456\. On src\/b\.js[\s\S]*Rename this\?\n$/, "every draft is in the one file");
const line = batchLine(2, path);
assert.ok(!/[\r\n]/.test(line), "the text typed into the agent is one line, since each newline would press Enter");
assert.ok(!/[\r\n]/.test(batchLine(1, "/s\n/x.md")), "a newline in the path cannot break the typed line");
assert.ok(line.startsWith("[Review: 2 comments] Read /s/herdr-review/comments/batch-10.md. "), "the typed line counts the comments and points at the batch file");
assert.match(line, /Answer each with: hreview reply <id> "<answer>"\./, "the agent is told how to answer each thread");
assert.match(line, /make it in your worktree, commit, and say what you changed in the reply\.$/, "the agent is told to commit asked-for changes and say what changed");
assert.equal(batchLine(1, path).slice(0, 20), "[Review: 1 comment] ", "one comment is counted in the singular");
assert.equal(sentSuffix(3), " (3 comments sent to the child)", "the coordinator hears how many comments went to the child");
assert.equal(sentSuffix(1), " (1 comment sent to the child)", "one comment sent to the child is singular");
assert.equal(sentSuffix(0), "", "with nothing sent to the child the coordinator's message is unchanged");

const root = "/w/replay-api", fake = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
const loadFrom = (store) => {
  const got = loadThreads((k) => store.get(k) ?? null, root);
  if (got.write) { store.set(storeKey(root), got.write); for (const k of got.drop) store.delete(k); }
  return got;
};
const onCommit = newThread({ id: "cdef456", path: "src/b.js", anchor, q: "And this?", now: 1500 });
const store = fake({ [`comments:${root}:work`]: [t0], [`comments:${root}:commit`]: [onCommit] });
assert.deepEqual(loadFrom(store).threads.map((t) => t.id), ["cabc123", "cdef456"], "threads written under Uncommitted still show under Since base");
assert.deepEqual([...store.keys()], [storeKey(root)], "the legacy per-range keys are removed once their threads are saved under the folder");
const again = loadFrom(store);
assert.deepEqual([again.write, again.drop, again.threads.map((t) => t.id)], [null, [], ["cabc123", "cdef456"]], "legacy per-range threads are merged once");
const older = fake({ [`comments:${root}:work`]: [t0], [`comments:${root}:branch`]: [replied] });
assert.equal(loadFrom(older).threads[0].exchanges.length, 2, "a thread kept under two ranges keeps its newer copy");
store.set(`comments:${root}:work`, [newThread({ id: "cghi789", path: "src/c.js", anchor, q: "Stale?", now: 1700 })]);
assert.deepEqual(loadFrom(store).threads.map((t) => t.id), ["cabc123", "cdef456"], "a legacy key left behind does not come back once the folder has its own");
assert.ok(store.has(`comments:${root}:work`), "loading never touches legacy keys once the folder has its own");

console.log("my-changes comment threads: all checks passed");
