import assert from "node:assert/strict";
import { chattyPairs, messageFeed, readTail, toolSummary } from "../feed.js";
import { displayName, parseSessions, spaceName, teamCards } from "../roster.js";

const term = (address, space, session, over = {}) => ({
  address, agent: "claude-code", status: "idle", state: "live", turn: 3, title: `title ${address}`,
  cwd: "/home/x/proj", labels: { "herdr.space": space, "claude.session": session, where: "alpha / 1" }, ...over,
});

const sessions = parseSessions([
  JSON.stringify({ sessionId: "s1", name: "api-agent", status: "busy" }),
  "{ not json",
  JSON.stringify({ name: "no id" }),
]);
assert.equal(sessions.size, 1, "only readable entries with an id are kept");
assert.equal(sessions.get("s1").busy, true);

const cards = teamCards({
  sessions, spaceId: "spA",
  terminals: [
    term("t1", "spA", "s1", { status: "working" }),
    term("t2", "spA", "s2", { status: "blocked", report: { msg: "answer: which one?" } }),
    term("t3", "spB", "s3"),
    term("t4", "spA", "s4", { agent: "zsh" }),
    term("t5", "spA", "s5", { state: "finished" }),
    term("t6", "spA", "s6", { status: "done" }),
  ],
});
assert.deepEqual(cards.map((c) => c.address), ["t2", "t1", "t6"], "same space, Claude only, live only, blocked first");
assert.equal(cards[0].question, "answer: which one?");
const viaApp = teamCards({ sessions, spaceId: "spA", terminals: [term("t7", "spA", "s7", { agent: null, app: "claude-code" }), term("t8", "spA", "s8", { agent: null, status: { app: "claude-code", state: "working" } })] });
assert.deepEqual(viaApp.map((c) => [c.address, c.status]), [["t8", "working"], ["t7", "idle"]], "Claude is recognised however herdr names it");
assert.equal(cards[1].name, "api-agent", "a card keeps the session name, which is how peers address it");
assert.equal(cards[1].label, "title t1", "and shows herdr's title for the agent, which follows its topic");
assert.equal(teamCards({ sessions, spaceId: "spA", terminals: [term("t7", "spA", "s1", { title: "" })] })[0].label, "api-agent", "until it has a title, the session name");
assert.equal(cards[1].where, "alpha / 1", "and says where herdr put it");
assert.equal(cards[0].name, "s2", "else a short session id");
assert.equal(displayName({ address: "t9", title: "my title", labels: {} }, sessions), "my title");
assert.equal(spaceName([term("t1", "spA", "s1")], "spA"), "alpha");
assert.equal(spaceName([], "spA"), "");

assert.equal(toolSummary("Edit", { file_path: "/a/b/Editor.tsx" }), "Edit Editor.tsx");
assert.equal(toolSummary("Bash", { command: "pnpm   test\n--watch" }), "Bash pnpm test --watch");
assert.equal(toolSummary("Mystery", { x: 1 }), "Mystery");
assert.ok(toolSummary("Bash", { command: "x".repeat(300) }).length < 90, "long commands are cut");

const line = (obj) => JSON.stringify(obj);
const tail = readTail([
  '{"type":"assistant","timestamp":"2026-11-24T10:00:00Z","message":{"content":[{"type":"text","text":"Looking at it"},{"type":"tool_use","name":"Read","input":{"file_path":"/a/x.ts"}}]}}',
  line({ type: "user", message: { content: "ignored" } }),
  "half a line that was cut {\"type\":\"ass",
  line({ type: "assistant", timestamp: "2026-11-24T10:01:00Z", message: { content: [{ type: "tool_use", name: "SendMessage", input: { to: "api-agent", message: "Does the\nlogin test pass?" } }] } }),
].join("\n"));
assert.equal(tail.lastTool, "SendMessage to api-agent");
assert.equal(tail.lastText, "Looking at it");
assert.deepEqual(tail.sent.map((m) => [m.to, m.text]), [["api-agent", "Does the login test pass?"]]);
assert.deepEqual(readTail(""), { lastTool: null, lastText: "", sent: [] });

const feed = messageFeed([
  { name: "a", tail: { sent: [{ at: 1, to: "b", text: "one" }, { at: 3, to: "b", text: "three" }] } },
  { name: "b", tail: { sent: [{ at: 2, to: "a", text: "two" }] } },
]);
assert.deepEqual(feed.map((m) => m.text), ["three", "two", "one"], "newest first");
assert.equal(feed[1].from, "b");

const now = 1_000_000;
const burst = Array.from({ length: 8 }, (_, i) => ({ at: now - i * 1000, from: i % 2 ? "a" : "b", to: i % 2 ? "b" : "a", text: "x" }));
assert.deepEqual(chattyPairs(burst, now), ["a and b"], "a busy pair is flagged either way round");
assert.deepEqual(chattyPairs(burst.slice(0, 3), now), [], "a few messages are fine");
assert.deepEqual(chattyPairs(burst.map((m) => ({ ...m, at: m.at - 3_600_000 })), now), [], "old messages do not count");

console.log("my-team roster and feed: all checks passed");
