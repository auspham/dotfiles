// Sends the drafts to whoever answers them, and reads the answers agents send back with hreview.

import { terminals, exec, readTextFile } from "herdr";
import { followedTerminal } from "./review_link.js";
import { deliveryAction, RETRY_MS } from "./guide.js";
import { pickTarget, claudePrompt } from "./comment_prompt.js";
import { patchLast, patchMany, setSession } from "./comment_threads.js";
import { draftsOf, stillThere, batchPath, batchNote, batchLine } from "./comment_batch.js";
import { repliesPath, parseReplies, applyReplies, listening } from "./comment_replies.js";

/** @typedef {import("./comment_store.js").CommentStore} CommentStore */

const statusOf = (address) => terminals().find((x) => x.address === address)?.status ?? null;

// Per machine, since a remote folder's agent reads and writes on that machine.
const stateHomes = new Map();
/** The state folder hreview writes under, on the machine `on`, or null. @param {string | null} on */
async function stateHome(on) {
  if (!stateHomes.get(on)) stateHomes.set(on, (await exec("sh", ["-c", 'printf %s "${XDG_STATE_HOME:-$HOME/.local/state}"'], { on }).catch(() => null))?.stdout || null);
  return stateHomes.get(on);
}

/** Writes the batch to its file and types one line pointing at it; the error to show, or null. @param {any[]} threads @param {{ address: string, name: string }} to @param {string | null} on */
async function sendBatch(threads, to, on) {
  const home = await stateHome(on);
  if (!home) return `Could not send to ${to.name}: no state folder to write the comments to.`;
  const path = batchPath(home, Date.now());
  const wrote = await exec("sh", ["-c", 'mkdir -p "$(dirname "$1")" && printf %s "$2" > "$1"', "sh", path, batchNote(threads)], { on }).catch((e) => ({ code: 1, stderr: String(e) }));
  const r = wrote.code === 0 ? await exec("hc", ["send", to.address, batchLine(threads.length, path)]).catch((e) => ({ code: 1, stderr: String(e) })) : wrote;
  return r.code === 0 ? null : `Could not send to ${to.name}: ${(r.stderr || "").trim() || `exit ${r.code}`}`;
}

/** Delivers a batch once the agent is not blocked, since text typed into an open dialog is lost; true when it went out. Reads threads by `key`, which stays right after a jump to another folder. */
/** @param {{ store: CommentStore, key: string, ids: string[], on: string | null }} job @param {{ address: string, name: string }} to @param {any} cx */
async function toAgent({ store, key, ids, on }, to, cx) {
  const start = Date.now();
  let action = deliveryAction(statusOf(to.address), 0);
  while (action === "wait") { await cx.sleep(RETRY_MS); action = deliveryAction(statusOf(to.address), Date.now() - start); }
  const threads = stillThere(store.threadsAt(key), ids);
  if (!threads.length) return true;
  const failed = action === "send" ? await sendBatch(threads, to, on) : `Not sent: ${to.name} stayed busy with a question for too long.`;
  // A failed batch goes back to drafts with its reason, so Send, or Done reviewing, can try it again.
  store.update(key, (ts) => patchMany(ts, ids, failed ? { status: "draft", to: null, a: failed } : { status: "sent" }));
  return !failed;
}

/** Asks claude -p through the panel's Ask pipeline: the thread keeps its own session, so it never races the Ask conversation; its first question forks the agent's session when there is one. */
/** @param {any} host @param {{ store: CommentStore, key: string, id: string, ask: object }} job @param {string | null} session */
async function toClaude(host, { store, key, id, ask }, session) {
  const thread = store.threadsAt(key).find((t) => t.id === id), own = thread?.session ?? null;
  if (!thread) return;
  try {
    const out = await host.askClaude(claudePrompt(thread), { ...ask, session: own ?? session, fork: !own && Boolean(session) });
    store.update(key, (ts) => patchLast(setSession(ts, id, out.session), id, { status: "done", a: out.text }));
  } catch (e) { store.update(key, (ts) => patchLast(ts, id, { status: "error", a: String(e?.message ?? e) })); }
}

/** @typedef {{ toChild: number, held: boolean, done: Promise<boolean> }} Batch toChild: comments the child agent gets; held: waiting for it to be free; done: whether it went out */

/** A Send for `store`: every draft goes to the live agent the panel follows as one batch, else each to claude -p. What it needs is taken at the click, since Done reviewing then jumps to another folder. @param {any} host the side panel's Changes view @param {CommentStore} store */
export function sender(host, store) {
  return (cx) => {
    const key = store.key, ids = draftsOf(store.threads).map((t) => t.id);
    if (!key || !ids.length) return { toChild: 0, held: false, done: Promise.resolve(true) };
    const target = pickTarget(terminals().find((x) => x.address === followedTerminal()), host.root);
    const finish = (cx) => { host.publishComments(); cx.notify(); };
    if (target.kind === "claude") {
      const ask = { root: host.root, on: host.on, model: host.modelId, effort: host.effortId };
      store.update(key, (ts) => patchMany(ts, ids, { status: "pending", a: "" }));
      for (const id of ids) cx.spawn(async (cx) => { await toClaude(host, { store, key, id, ask }, target.session); finish(cx); });
      return { toChild: 0, held: false, done: Promise.resolve(true) };
    }
    const to = { address: target.address, name: target.name }, held = deliveryAction(statusOf(to.address), 0) === "wait";
    // Marked at once, so a second click finds no drafts and cannot send them twice.
    store.update(key, (ts) => patchMany(ts, ids, { status: held ? "held" : "sent", to, a: "" }));
    const done = new Promise((resolve) => cx.spawn(async (cx) => { const ok = await toAgent({ store, key, ids, on: host.on ?? null }, to, cx); finish(cx); resolve(ok); }));
    return { toChild: ids.length, held, done };
  };
}

/** Reads the hreview replies file and joins new answers to their threads; true when one arrived. @param {CommentStore} store @param {string | null} on */
export async function pollReplies(store, on) {
  if (!store.key || !listening(store.threads)) return false;
  const home = await stateHome(on);
  if (!home) return false;
  const text = await readTextFile(repliesPath(home), { on }).catch(() => null);
  if (!text) return false;
  const { threads, changed } = applyReplies(store.threads, parseReplies(text));
  if (changed) store.update(store.key, () => threads);
  return changed;
}
