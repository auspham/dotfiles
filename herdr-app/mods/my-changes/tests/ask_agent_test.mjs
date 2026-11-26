import assert from "node:assert/strict";
import { askPath, askNote, askLine, applyChatReplies, chatListening, settleChat } from "../ask_agent.js";
import { parseReplies } from "../comment_replies.js";

const id = Date.UTC(2026, 10, 26).toString(36);
const to = { address: "t7", name: "fixer" };
const path = askPath("/state", id);

assert.match(id, /^[a-z0-9]{4,16}$/, "a chat message id passes hreview's id check");
assert.equal(path, `/state/herdr-review/asks/ask-${id}.md`, "each question is written to its own file under the state folder");
assert.ok(!path.includes("/comments/batch-"), "a question file never takes a comment batch's name");

const note = askNote(id, "About src/a.js (the uncommitted changes), line 3:\n\n```diff\n+ 3 | let x = 2\n```\n\nWhy 2?");
assert.ok(note.includes(`hreview reply ${id} "<answer>"`), "the file says how to answer, with the message id");
assert.ok(note.includes("```diff\n+ 3 | let x = 2\n```") && note.includes("Why 2?"), "the file carries the question with its diff");

const line = askLine(id, path);
assert.ok(line.includes(`Read ${path}.`) && line.includes(`hreview reply ${id} "<answer>"`), "the typed line points at the file and names the message id");
assert.ok(line.includes("make it in your worktree, commit"), "the typed line asks for a change to be made and committed");
assert.ok(!/[\r\n]/.test(line) && !/[\r\n]/.test(askLine(id, "/s\n/x.md")), "the typed line has no newline, even from the path");

const sent = { id, path: "src/a.js", label: "line 3", q: "Why 2?", a: "", status: "sent", at: 1, to };
const byClaude = { id, path: "src/a.js", label: "", q: "And y?", a: "", status: "pending", at: 2 };
const replies = parseReplies([
  JSON.stringify({ id, text: "Because of the cache.", from: "t7" }),
  JSON.stringify({ id, text: "Not me.", from: "t9" }),
  JSON.stringify({ id: "other", text: "Elsewhere.", from: "t7" }),
].join("\n"));

const once = applyChatReplies([sent, byClaude], replies);
assert.ok(once.changed, "a reply from the agent the question went to is heard");
assert.deepEqual([once.messages[0].status, once.messages[0].a], ["done", "Because of the cache."], "it answers the message with the same id, and a reply from another terminal is passed over");
assert.equal(once.messages[1], byClaude, "a message answered by claude -p takes no agent replies");
assert.equal(applyChatReplies(once.messages, replies).changed, false, "reading the same file again changes nothing");

const more = parseReplies([...replies.map((r) => JSON.stringify(r)), JSON.stringify({ id, text: "Fixed in abc123.", from: "t7" })].join("\n"));
assert.equal(applyChatReplies(once.messages, more).messages[0].a, "Because of the cache.\n\nFixed in abc123.", "a second reply from the agent is added under the first");
assert.equal(applyChatReplies([{ ...sent, status: "pending" }], replies).changed, false, "a question still being delivered takes no reply yet");
assert.equal(applyChatReplies([{ ...sent, status: "error", a: "Could not send" }], replies).changed, false, "a question that failed to send takes no reply");

assert.ok(chatListening([sent]) && chatListening(once.messages), "keeps reading replies for a sent question, and after its first answer, since an agent may send several");
assert.equal(chatListening([byClaude, { ...sent, status: "pending" }]), false, "no question waiting on an agent needs no replies file");

const settled = settleChat([sent, byClaude, { ...sent, id: "zz11", status: "pending" }, once.messages[0]]);
assert.equal(settled[0], sent, "a question sent to an agent still waits for its reply after a reload");
assert.deepEqual([settled[1].status, settled[2].status], ["error", "error"], "a question cut off by a reload, by claude or mid-delivery, shows as interrupted");
assert.equal(settled[3].status, "done", "an answered question stays answered");

console.log("ask_agent: ok");
