import assert from "node:assert/strict";
import { wrapText, threadLines, blockHeight, blockCols, layoutItems, placeThreads, BLOCK_PAD, GAP_H, MAX_ANSWER_LINES } from "../comment_layout.js";
import { newThread, patchLast, addReply, setResolved } from "../comment_threads.js";
import { threadChip } from "../comment_status.js";
import { writeMode, barAction, barTitle, barShows } from "../comment_bar.js";
import { splitSources } from "../comment_anchor.js";

assert.deepEqual(wrapText("one two three four", 9), ["one two", "three", "four"], "wraps at word breaks");
assert.deepEqual(wrapText("abcdefghijkl", 8), ["abcdefgh", "ijkl"], "breaks a word longer than the line");
assert.deepEqual(wrapText("a\n\nb", 20), ["a", "", "b"], "keeps the answer's blank lines");

const anchor = { lines: [{ side: "new", n: 3, text: "let x = 2" }], before: [], after: [] };
const t = newThread({ id: "cabc123", path: "a.js", anchor, q: "Why is this two?", now: 1 });
const open = { collapsed: false, outdated: false };
const text = (th) => threadLines(th, 80, open).map((l) => l.text);
assert.deepEqual(text(t), ["Line 3", "You", "Why is this two?", "Click to edit or delete"], "a new comment shows who wrote it and how to change it, with no sent line");
assert.deepEqual(threadLines(t, 80, open)[0].chip, { label: "Queued", tone: "queued" }, "a new comment's header says it is queued");
const retry = threadLines(patchLast([t], t.id, { a: "Could not send to fixer: exit 1" })[0], 80, open)[3];
assert.deepEqual([retry.text, retry.tone], ["Could not send to fixer: exit 1 Send all tries again.", "error"], "a queued comment whose send failed says why and that Send all retries it");
const pending = patchLast([t], t.id, { status: "pending" })[0];
assert.deepEqual(text(pending).slice(1), ["You", "Why is this two?", "Click to collapse or delete"], "a waiting comment leaves the waiting to its header chip");
const sent = patchLast([t], t.id, { status: "sent", to: { address: "t7", name: "fixer" } })[0];
assert.equal(threadLines(sent, 80, open)[0].chip.label, "Waiting for fixer", "a comment sent to an agent names it while waiting");
const answered = patchLast([sent], t.id, { status: "done", a: "Because." })[0];
assert.deepEqual(threadLines(answered, 80, open).slice(3, 5).map((l) => [l.text, l.tone]), [["fixer", "who"], ["Because.", "body"]], "an agent's answer sits under its name in body text");
assert.equal(text(answered).at(-1), "Click to reply or resolve", "an answered thread hints at reply and resolve");
const twice = addReply([answered], t.id, "And three?", 2)[0];
assert.deepEqual(threadLines(twice, 80, open).slice(5, 7).map((l) => l.tone), ["gap", "you"], "a short gap separates exchanges");
const failed = patchLast([t], t.id, { status: "error", a: "No answer came back." })[0];
assert.equal(threadLines(failed, 80, open)[3].tone, "error", "an error shows in the error tone");
assert.equal(threadLines(t, 80, { collapsed: true, outdated: false }).length, 1, "a collapsed thread is one line");
assert.match(threadLines(answered, 80, { collapsed: true, outdated: false })[0].text, /^▸ Line 3 · 1 reply · Why/, "a collapsed thread counts its replies");
assert.match(threadLines({ ...t, resolved: true }, 80, open)[0].text, /^✓ Resolved · Line 3 · Why/, "a resolved thread shrinks to a marker");
assert.match(threadLines(t, 80, { collapsed: false, outdated: true })[0].text, /^Line 3, no longer in this diff/, "an outdated thread says its lines are gone");
const range = { ...t, anchor: { ...anchor, lines: [6, 7, 8, 9].map((n) => ({ side: "new", n, text: "x" })) } };
assert.equal(threadLines(range, 80, open)[0].text, "Lines 6-9", "a thread on several lines names the range");
assert.equal(JSON.stringify(threadLines(answered, 80, open)).includes("raft"), false, "no line says draft");
const long = patchLast([t], t.id, { status: "done", a: Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n") })[0];
const lines = threadLines(long, 80, open);
assert.equal(lines.length, 3 + 1 + MAX_ANSWER_LINES + 1, "a long answer is cut inline");
assert.match(lines[lines.length - 2].text, /more lines$/, "and says how much is left");

assert.equal(blockHeight([{ text: "a", tone: "body" }, { text: "", tone: "gap" }, { text: "b", tone: "body" }], 20), 40 + GAP_H + BLOCK_PAD, "a card is as tall as its lines and gaps plus padding");
assert.equal(blockCols(500, 6.7, 40), 68, "the text wraps to the visible width");
assert.equal(threadLines(t, blockCols(120, 6.7, 40), open).length > threadLines(t, 80, open).length, true, "a narrow panel wraps a thread onto more lines");

const { items, heights } = layoutItems(3, 20, [{ after: 1, key: "b", h: 70 }, { after: -1, key: "top", h: 30 }]);
assert.deepEqual(items.map((i) => ("row" in i ? i.row : i.block.key)), ["top", 0, 1, "b", 2], "places blocks under their rows and outdated ones at the top");
assert.deepEqual(heights, [30, 20, 20, 70, 20], "gives each item its own height for the virtual list");
assert.deepEqual(layoutItems(2, [40, 20], []).heights, [40, 20], "keeps split rows' wrapped heights");

const ctx = (n, text) => ({ kind: " ", old: n, number: n, text });
const rows = [{ kind: "@", text: "@@" }, ctx(1, "a"), { kind: "-", number: 2, text: "old" }, { kind: "+", number: 2, text: "let x = 2" }, ctx(3, "b")];
const gone = newThread({ id: "cgone00", path: "a.js", anchor: { ...anchor, lines: [{ side: "new", n: 9, text: "vanished" }] }, q: "?", now: 1 });
const unified = placeThreads([t, gone], rows, null);
assert.deepEqual(unified.placed.map((p) => p.after), [3], "a thread sits under its last anchored row");
assert.deepEqual(unified.outdated.map((x) => x.id), ["cgone00"], "a thread whose lines are gone is kept as outdated");
assert.deepEqual([...unified.marked], [3], "marks the anchored rows in the gutter");
const split = [rows[0], { kind: "pair", left: { ...rows[1] }, right: rows[1] }, { kind: "pair", left: rows[2], right: rows[3] }, { kind: "pair", left: { ...rows[4] }, right: rows[4] }];
assert.deepEqual(placeThreads([t], rows, splitSources(split, rows)).placed[0].after, 2, "in split mode a thread sits under the pair that draws its line");

const agent = { address: "t7", name: "fixer" };
assert.deepEqual(threadChip(patchLast([t], t.id, { status: "done", a: "ok", to: agent })[0]), { label: "Answered", tone: "answered" }, "an answered thread's chip is green Answered");
assert.deepEqual(threadChip(setResolved([t], t.id, true)[0]), { label: "Resolved", tone: "resolved" }, "a resolved thread's chip is Resolved whatever its last comment");
assert.deepEqual(threadChip(patchLast([t], t.id, { a: "exit 1" })[0]), { label: "Not sent", tone: "failed" }, "a queued comment whose send failed is Not sent");
assert.deepEqual(threadChip(patchLast([t], t.id, { status: "error", a: "cut off" })[0]), { label: "No answer", tone: "failed" }, "a sent comment whose answer failed is No answer, not Not sent");
assert.equal(threadChip(patchLast([t], t.id, { status: "held", to: agent })[0]).label, "Waiting for fixer", "a comment held for a busy agent waits for it");

assert.deepEqual(barAction({ typed: true, queued: 2, mode: "new" }), { kind: "queue", label: "Queue comment" }, "typing turns the primary button into Queue comment");
assert.deepEqual(barAction({ typed: false, queued: 2, mode: "new" }), { kind: "send", label: "Send all (2)" }, "an empty input with comments queued offers Send all");
assert.equal(barAction({ typed: false, queued: 0, mode: "new" }), null, "nothing typed and nothing queued shows no primary button");
assert.equal(barAction({ typed: true, queued: 0, mode: "reply" }).label, "Queue reply", "typing under an answered thread queues a reply");
assert.equal(barAction({ typed: true, queued: 1, mode: "edit" }).label, "Save changes", "typing while editing a queued comment saves it");
assert.deepEqual(barAction({ typed: true, queued: 1, mode: null }), { kind: "send", label: "Send all (1)" }, "with no input shown the button still sends the queue");
assert.equal(writeMode(null, null), null, "a closed bar writes nothing");
assert.equal(writeMode({ mode: "new" }, null), "new", "new lines take a new comment");
assert.equal(writeMode({ mode: "thread" }, t), null, "a queued comment shows no input until Edit, so a reply never stacks on it");
assert.equal(writeMode({ mode: "thread", editing: true }, t), "edit", "Edit rewrites the queued comment");
assert.equal(writeMode({ mode: "thread" }, sent), null, "a thread waiting on its agent takes no reply");
assert.equal(writeMode({ mode: "thread" }, answered), "reply", "an answered thread takes a reply");
assert.equal(barTitle(null, "", 3), "3 comments queued, not sent yet", "the bar with no thread says how many are queued");
assert.equal(barTitle("new", "lines 6-9", 0), "New comment on lines 6-9", "the bar names the lines a new comment is on");

console.log("my-changes comment layout: all checks passed");
assert.deepEqual(barShows({ mode: "thread", id: "gone" }, null, 2), { editor: false, queue: true }, "keeps the Send all strip when the open thread is gone");
assert.deepEqual(barShows(null, null, 1), { editor: false, queue: true }, "a queued comment keeps the Send all strip with nothing open");
assert.deepEqual(barShows({ mode: "new" }, null, 0), { editor: true, queue: false }, "new lines open the editor with nothing queued");
assert.deepEqual(barShows(null, null, 0), { editor: false, queue: false }, "nothing open and nothing queued shows no bar");
