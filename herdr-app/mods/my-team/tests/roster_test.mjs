import assert from "node:assert/strict";
import { chattyPairs, feedCount, firstLine, messageFeed, messageKey, readTail, toolSummary } from "../feed.js";
import { childSummary, displayName, groupCards, resolveTarget, parseSessions, spaceName, teamCards } from "../roster.js";
import { MODELS, labelChanges, parseSettings, settingsFor, withSetting } from "../settings.js";

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
assert.deepEqual(tail.sent.map((m) => [m.to, m.text]), [["api-agent", "Does the\nlogin test pass?"]]);
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

const lead = term("t9", "spA", "s1", { labels: { "herdr.space": "spA", "claude.session": "s1", role: "coordinator" } });
const kid = (address, status, review) => term(address, "spA", "s2", { status, labels: { "herdr.space": "spA", "claude.session": "s2", role: "child", task: "login-fix", branch: "agent/login-fix", review } });
const group = teamCards({ terminals: [kid("t2", "working", "pending"), term("t1", "spA", "s2", { status: "blocked" }), lead], sessions, spaceId: "spA" });
assert.deepEqual(group.map((c) => c.address), ["t9", "t1", "t2"], "the coordinator leads, then the agent that needs you");
assert.equal(group[2].role, "child");
assert.equal(group[2].task, "login-fix");
assert.equal(group[2].review, "pending");

const kids = (...states) => states.map(([status, review], i) => ({ role: "child", status, review, address: `t${i}` }));
assert.equal(childSummary([lead].map(() => ({ role: "coordinator" }))), "", "no children, no summary");
assert.equal(childSummary(kids(["working", "pending"], ["working", "pending"], ["idle", "pending"])), "2 working, 1 ready for review");
assert.equal(childSummary(kids(["idle", "approved"])), "1 child, nothing waiting");
assert.equal(childSummary(kids(["idle", "changes"])), "1 child, nothing waiting", "a child sent back is not waiting for review");

const fresh = { enabled: true, model: "claude-sonnet-5-5", effort: "medium" };
assert.deepEqual(settingsFor(parseSettings(""), "spA"), fresh, "a space with no entry is on with sonnet and medium");
assert.deepEqual(settingsFor(parseSettings("{ nope"), "spA"), fresh, "a broken file means no space has saved settings");
assert.deepEqual(settingsFor({ spA: { model: "claude-opus-5-5" } }, "spA"), { ...fresh, model: "claude-opus-5-5" }, "a missing key takes its default");
const off = withSetting({}, "spA", { enabled: false });
assert.equal(settingsFor(parseSettings(off), "spA").enabled, false, "an explicit off stays off");
assert.equal(settingsFor(parseSettings(off), "spB").enabled, true, "other spaces keep the default");
const plain = withSetting({}, "spA", { model: "", effort: "" });
assert.deepEqual(settingsFor(parseSettings(plain), "spA"), { enabled: true, model: "", effort: "" }, "an explicit Default model and effort stay Default");
const picked = withSetting(parseSettings(off), "spA", { model: "claude-haiku-5-5" });
assert.deepEqual(settingsFor(parseSettings(picked), "spA"), { enabled: false, model: "claude-haiku-5-5", effort: "medium" }, "a model choice keeps the switch");
const effortful = withSetting(parseSettings(picked), "spA", { effort: "high" });
assert.deepEqual(settingsFor(parseSettings(effortful), "spA"), { enabled: false, model: "claude-haiku-5-5", effort: "high" }, "effort is kept beside the model");
assert.equal(settingsFor({ spA: { effort: "turbo" } }, "spA").effort, "", "an unknown effort is ignored");
assert.equal(settingsFor({ spA: { enabled: true, model: "gpt" } }, "spA").model, "", "an unknown model is ignored");
assert.ok(MODELS.every((m) => typeof m.label === "string"));

const trio = [{ address: "t1", role: "" }, { address: "t2", role: "" }];
assert.deepEqual(labelChanges(trio, true), [["t1", "role=coordinator"], ["t2", "role=coordinator"]], "switching on makes every agent without a role a coordinator");
assert.deepEqual(labelChanges([{ address: "t1", role: "coordinator" }, { address: "t3", role: "child" }, trio[1]], true), [["t2", "role=coordinator"]], "switching on keeps existing coordinators and children as they are");
assert.deepEqual(labelChanges([{ address: "t1", role: "coordinator" }, { address: "t2", role: "child" }, trio[0]], false), [["t1", "role="], ["t1", "coord="]], "switching off takes the role from every coordinator and leaves children alone");
const family = [{ address: "t1", role: "coordinator" }, { address: "t2", role: "child", coord: "t1" }];
const afterOff = family.map((c) => (labelChanges(family, false).some(([a]) => a === c.address) ? { ...c, role: "" } : c));
assert.deepEqual(labelChanges(afterOff, true), [["t1", "role=coordinator"]], "switching the mode off and on again keeps children as children");
assert.deepEqual(labelChanges([], true), [], "nobody to lead, nothing to label");

const withSocket = parseSessions([JSON.stringify({ sessionId: "s7", name: "api-agent", messagingSocketPath: "/run/user/1000/cc-socks/42.sock" })]);
assert.equal(resolveTarget("uds:/run/user/1000/cc-socks/42.sock", withSocket), "api-agent", "a socket address becomes the session's name");
assert.equal(resolveTarget("uds:/run/user/1000/cc-socks/99.sock", withSocket), "a closed session", "an address nobody owns is not shown raw");
assert.equal(resolveTarget("api-agent", withSocket), "api-agent", "a name is kept");

const multi = readTail(JSON.stringify({ type: "assistant", timestamp: "2026-01-01T00:00:00Z", message: { content: [{ type: "tool_use", name: "SendMessage", input: { to: "b", message: "first line\nsecond line" } }] } }));
assert.equal(multi.sent[0].text, "first line\nsecond line", "a message keeps its line breaks");
assert.equal(firstLine(multi.sent[0].text), "first line", "a message shows only its first line until expanded");
assert.equal(firstLine(null), "");
assert.equal(feedCount(12), "12 messages", "the feed count is shown in the header");
assert.equal(feedCount(1), "1 message");
assert.notEqual(messageKey({ at: 1, from: "a", to: "b" }), messageKey({ at: 2, from: "a", to: "b" }), "messages have distinct keys");

const reviewed = [{ role: "child", status: "idle", review: "reviewing" }, { role: "child", status: "idle", review: "pending" }];
assert.equal(childSummary(reviewed), "1 in review, 1 ready for review", "a child being reviewed is counted as in review, not waiting");

assert.equal(childSummary(kids(["working", "pending"], ["idle", "yours"], ["idle", "yours"])), "1 working, 2 waiting for you", "a child whose review is yours is counted as waiting for you");

assert.equal(childSummary(kids(["idle", "reviewed"], ["idle", "reviewed"])), "2 reviewed by you", "a child reviewed by the user is counted as reviewed by you");

const sessionsAB = parseSessions(["a", "b"].map((n) => JSON.stringify({ sessionId: `s-${n}`, name: `lead-${n}` })));
const agent = (address, labels, status = "idle") => term(address, "spA", `s-${address}`, { status, labels: { "herdr.space": "spA", "claude.session": `s-${address}`, ...labels } });
const many = teamCards({
  sessions: sessionsAB, spaceId: "spA",
  terminals: [
    agent("t5", { role: "child", coord: "t2" }, "working"),
    agent("t6", { role: "child", coord: "t9" }),
    agent("t4", { role: "child", coord: "t1" }, "working"),
    agent("t3", { role: "child", coord: "t1" }, "blocked"),
    term("t2", "spA", "s-b", { labels: { "herdr.space": "spA", "claude.session": "s-b", role: "coordinator" } }),
    term("t1", "spA", "s-a", { labels: { "herdr.space": "spA", "claude.session": "s-a", role: "coordinator" } }),
    agent("t7", { role: "child", coord: "t1", owner: "t2" }),
  ],
});
assert.deepEqual(many.map((c) => c.address), ["t1", "t3", "t4", "t7", "t2", "t5", "t6"], "each coordinator is followed by its own children, then anything else");
assert.equal(many[1].coord, "t1", "a card carries its coord label");
assert.equal(many[1].coordName, "lead-a", "a child carries its coordinator's name");
assert.equal(many[3].owner, "t2", "a card carries its owner label");
assert.equal(many[3].ownerName, "lead-b", "a lent child carries its owner's name");
assert.equal(many[1].ownerName, "", "a child that is not lent has no owner");
assert.equal(many[6].coordName, "", "a child whose coordinator is gone is not grouped");
assert.equal(groupCards([{ address: "t1", name: "x", role: "child", coord: "t2", owner: "t8", status: "idle" }, { address: "t2", name: "c", role: "coordinator", status: "idle" }])[1].ownerName, "t8", "an owner with no card is shown by its terminal");
assert.equal(childSummary(many), "2 working", "the summary counts the children of every coordinator");

console.log("my-team roster and feed: all checks passed");
