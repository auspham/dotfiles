import assert from "node:assert/strict";
import { wrapText, threadLines, blockHeight, blockCols, layoutItems, placeThreads, BLOCK_PAD, MAX_ANSWER_LINES } from "../comment_layout.js";
import { newThread, patchLast } from "../comment_threads.js";
import { splitSources } from "../comment_anchor.js";
import { writeMode, barAction, barTitle } from "../comment_bar.js";

assert.deepEqual(wrapText("one two three four", 9), ["one two", "three", "four"], "wraps at word breaks");
assert.deepEqual(wrapText("abcdefghijkl", 8), ["abcdefgh", "ijkl"], "breaks a word longer than the line");
assert.deepEqual(wrapText("a\n\nb", 20), ["a", "", "b"], "keeps the answer's blank lines");

const anchor = { lines: [{ side: "new", n: 3, text: "let x = 2" }], before: [], after: [] };
const t = newThread({ id: "cabc123", path: "a.js", anchor, q: "Why is this two?", now: 1 });
const open = { collapsed: false, outdated: false };
assert.deepEqual(threadLines(t, 80, open).map((l) => l.text), ["Comment on line 3", "You: Why is this two?", "Queued: not sent until you click Send all", "Click to edit or delete"], "a new comment shows as queued, not as sent");
const retry = threadLines(patchLast([t], t.id, { a: "Could not send to fixer: exit 1" })[0], 80, open)[2];
assert.deepEqual([retry.text, retry.tone], ["Could not send to fixer: exit 1 Send all tries again.", "error"], "a queued comment whose send failed says why and that Send all retries it");
const pending = patchLast([t], t.id, { status: "pending" })[0];
assert.deepEqual(threadLines(pending, 80, open).slice(2).map((l) => l.text), ["Thinking…", "Click to collapse, resolve or delete"], "a comment asked of claude shows Thinking");
const sent = patchLast([t], t.id, { status: "sent", to: { address: "t7", name: "fixer" } })[0];
assert.equal(threadLines(sent, 80, open)[2].text, "Sent to fixer", "a comment sent to an agent names it while waiting");
const answered = patchLast([sent], t.id, { status: "done", a: "Because." })[0];
assert.deepEqual(threadLines(answered, 80, open).slice(2, 4).map((l) => l.text), ["fixer:", "Because."], "an agent's answer sits under its name");
const failed = patchLast([t], t.id, { status: "error", a: "No answer came back." })[0];
assert.equal(threadLines(failed, 80, open)[2].tone, "error", "an error shows in the error tone");
assert.equal(threadLines(t, 80, { collapsed: true, outdated: false }).length, 1, "a collapsed thread is one line");
assert.match(threadLines({ ...t, resolved: true }, 80, open)[0].text, /^✓ Resolved · Why/, "a resolved thread shrinks to a marker");
assert.match(threadLines(t, 80, { collapsed: false, outdated: true })[0].text, /^Outdated: line 3/, "an outdated thread says its lines are gone");
const long = patchLast([t], t.id, { status: "done", a: Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n") })[0];
const lines = threadLines(long, 80, open);
assert.equal(lines.filter((l) => l.tone === "answer").length, MAX_ANSWER_LINES, "a long answer is cut inline");
assert.match(lines[lines.length - 2].text, /more lines$/, "and says how much is left");

assert.equal(blockHeight(4, 20), 80 + BLOCK_PAD, "a block is as tall as its lines plus padding");
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

const sent2 = patchLast([t], t.id, { status: "sent" })[0], answered2 = patchLast([sent2], t.id, { status: "done", a: "ok" })[0];
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
assert.equal(writeMode({ mode: "thread" }, answered2), "reply", "an answered thread takes a reply");
assert.equal(barTitle(null, "", 3), "3 comments queued, not sent yet", "the bar with no thread says how many are queued");
assert.equal(barTitle("new", "lines 6-9", 0), "New comment on lines 6-9", "the bar names the lines a new comment is on");

console.log("my-changes comment layout: all checks passed");
