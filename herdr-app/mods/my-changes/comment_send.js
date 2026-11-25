// Sends a thread's newest comment to whoever answers it, and reads the answers agents send back with hreview.

import { terminals, exec, readTextFile } from "herdr";
import { followedTerminal } from "./review_link.js";
import { deliveryAction, RETRY_MS } from "./guide.js";
import { pickTarget, agentMessage, claudePrompt } from "./comment_prompt.js";
import { patchLast, setSession } from "./comment_threads.js";
import { repliesPath, parseReplies, applyReplies } from "./comment_replies.js";

/** @typedef {import("./comment_store.js").CommentStore} CommentStore */

const statusOf = (address) => terminals().find((x) => x.address === address)?.status ?? null;

/** Types the comment into the agent's terminal once it is not blocked, since text typed into an open dialog is lost. */
/** @param {{ store: CommentStore, key: string, id: string }} job @param {{ address: string, name: string }} target @param {any} cx */
async function toAgent({ store, key, id }, target, cx) {
  const to = { address: target.address, name: target.name }, start = Date.now();
  let action = deliveryAction(statusOf(to.address), 0);
  store.update(key, (ts) => patchLast(ts, id, { status: action === "wait" ? "held" : "sent", to }));
  cx.notify();
  while (action === "wait") { await cx.sleep(RETRY_MS); action = deliveryAction(statusOf(to.address), Date.now() - start); }
  const thread = store.key === key ? store.find(id) : null;
  if (!thread) { store.update(key, (ts) => patchLast(ts, id, { status: "error", a: "Not sent: the view moved to another range while the agent was busy." })); return; }
  const r = action === "send" ? await exec("hc", ["send", to.address, agentMessage(thread)]).catch((e) => ({ code: 1, stderr: String(e) })) : null;
  const failed = !r ? `Not sent: ${to.name} stayed busy with a question for too long.` : r.code !== 0 ? `Could not send to ${to.name}: ${(r.stderr || "").trim() || `exit ${r.code}`}` : null;
  store.update(key, (ts) => patchLast(ts, id, failed ? { status: "error", a: failed } : { status: "sent" }));
}

/** Asks claude -p through the panel's Ask pipeline: the thread keeps its own session, so it never races the Ask conversation; its first question forks the agent's session when there is one. */
/** @param {any} host @param {{ store: CommentStore, key: string, id: string }} job @param {string | null} session */
async function toClaude(host, { store, key, id }, session) {
  const thread = store.find(id), own = thread?.session ?? null;
  if (!thread) return;
  try {
    const out = await host.askClaude(claudePrompt(thread), { root: host.root, on: host.on, model: host.modelId, effort: host.effortId, session: own ?? session, fork: !own && Boolean(session) });
    store.update(key, (ts) => patchLast(setSession(ts, id, out.session), id, { status: "done", a: out.text }));
  } catch (e) { store.update(key, (ts) => patchLast(ts, id, { status: "error", a: String(e?.message ?? e) })); }
}

/** A Deliver for `store`: sends thread `id`'s newest comment to the live agent the panel follows, else to claude -p. @param {any} host the side panel's Changes view @param {CommentStore} store */
export function deliverer(host, store) {
  return (key, id, cx) => {
    const target = pickTarget(terminals().find((x) => x.address === followedTerminal()), host.root);
    cx.spawn(async (cx) => {
      const job = { store, key, id };
      if (target.kind === "agent") await toAgent(job, target, cx);
      else await toClaude(host, job, target.session);
      host.publishComments(); cx.notify();
    });
  };
}

// Per machine, since a remote folder's agents write on that machine.
const stateHomes = new Map();
/** Reads the hreview replies file and joins new answers to their threads; true when one arrived. @param {CommentStore} store @param {string | null} on */
export async function pollReplies(store, on) {
  if (!store.key || !store.threads.some((t) => t.exchanges[t.exchanges.length - 1].to)) return false;
  if (!stateHomes.get(on)) stateHomes.set(on, (await exec("sh", ["-c", 'printf %s "${XDG_STATE_HOME:-$HOME/.local/state}"'], { on }).catch(() => null))?.stdout || null);
  const home = stateHomes.get(on);
  if (!home) return false;
  const text = await readTextFile(repliesPath(home), { on }).catch(() => null);
  if (!text) return false;
  const { threads, changed } = applyReplies(store.threads, parseReplies(text));
  if (changed) store.update(store.key, () => threads);
  return changed;
}
