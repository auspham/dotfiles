// Comment threads on diff lines and the changes made to them. Every change returns a new list. Pure: no herdr imports, so node can test it.

import { parseAnchor } from "./comment_anchor.js";

/** @typedef {import("./comment_anchor.js").Anchor} Anchor */
/** held: waiting for a blocked agent; sent: typed to the agent, awaiting hreview; pending: asked of claude -p. */
/** @typedef {"held" | "sent" | "pending" | "done" | "error"} Status */
/** @typedef {{ address: string, name: string }} Agent */
/** @typedef {{ q: string, a: string, status: Status, to: Agent | null, at: number }} Exchange */
/** heard: how many hreview lines for this thread were already read, so reading the file again adds nothing twice. */
/** @typedef {{ id: string, path: string, anchor: Anchor, at: number, resolved: boolean, session: string | null, heard: number, exchanges: Exchange[] }} Thread */

export const STATUSES = ["held", "sent", "pending", "done", "error"];
export const MAX_THREADS = 500;
const ID = /^[a-z0-9]{4,16}$/;

/** A short thread id the agent can type back to hreview. @param {() => number} random */
export const threadId = (random = Math.random) => `c${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;

/** @param {string} q @param {number} now @returns {Exchange} */
const exchange = (q, now) => ({ q, a: "", status: "pending", to: null, at: now });

/** A new thread with its first comment. @param {{ id: string, path: string, anchor: Anchor, q: string, now: number }} spec @returns {Thread} */
export const newThread = ({ id, path, anchor, q, now }) => ({ id, path, anchor, at: now, resolved: false, session: null, heard: 0, exchanges: [exchange(q, now)] });

/** @param {Thread[]} threads @param {string} id @param {(t: Thread) => Thread} change */
const edit = (threads, id, change) => threads.map((t) => (t.id === id ? change(t) : t));

/** Adds a follow-up comment to a thread, which reopens it. @param {Thread[]} threads @param {string} id @param {string} q @param {number} now */
export const addReply = (threads, id, q, now) => edit(threads, id, (t) => ({ ...t, resolved: false, exchanges: [...t.exchanges, exchange(q, now)] }));

/** Changes a thread's newest exchange. @param {Thread[]} threads @param {string} id @param {Partial<Exchange>} patch */
export const patchLast = (threads, id, patch) => edit(threads, id, (t) => ({ ...t, exchanges: [...t.exchanges.slice(0, -1), { ...t.exchanges[t.exchanges.length - 1], ...patch }] }));

/** @param {Thread[]} threads @param {string} id @param {boolean} resolved */
export const setResolved = (threads, id, resolved) => edit(threads, id, (t) => ({ ...t, resolved }));

/** @param {Thread[]} threads @param {string} id @param {string | null} session */
export const setSession = (threads, id, session) => edit(threads, id, (t) => ({ ...t, session }));

/** @param {Thread[]} threads @param {string} id */
export const removeThread = (threads, id) => threads.filter((t) => t.id !== id);

/** @param {Thread} t */
export const lastOf = (t) => t.exchanges[t.exchanges.length - 1];

/** Whether the thread still waits on an answer. @param {Thread} t */
export const waiting = (t) => ["held", "sent", "pending"].includes(lastOf(t).status);

/** After a reload no task is left to finish a claude -p call or a held delivery, so those end as errors; a message already sent may still get its hreview reply. @param {Thread[]} threads */
export function settleAfterReload(threads) {
  const why = { pending: "Interrupted: the panel reloaded before the answer arrived.", held: "Not sent: the panel reloaded while the agent was busy." };
  return threads.map((t) => (why[lastOf(t).status] ? patchLast([t], t.id, { status: "error", a: why[lastOf(t).status] })[0] : t));
}

const isText = (v, max) => typeof v === "string" && v.length <= max;
const isAgent = (v) => v === null || (Boolean(v) && isText(v.address, 64) && v.address.length > 0 && isText(v.name, 200));

/** @param {any} e @returns {Exchange | null} */
function parseExchange(e) {
  if (!e || typeof e !== "object" || !isText(e.q, 20000) || !isText(e.a, 200000) || !STATUSES.includes(e.status)) return null;
  if (!isAgent(e.to ?? null) || !Number.isFinite(e.at)) return null;
  return { q: e.q, a: e.a, status: e.status, to: e.to ? { address: e.to.address, name: e.to.name } : null, at: e.at };
}

/** @param {any} t @returns {Thread | null} */
function parseThread(t) {
  if (!t || typeof t !== "object" || typeof t.id !== "string" || !ID.test(t.id) || !isText(t.path, 1024) || !t.path) return null;
  const anchor = parseAnchor(t.anchor), list = Array.isArray(t.exchanges) ? t.exchanges.slice(0, 200).map(parseExchange) : [];
  if (!anchor || !list.length || list.includes(null) || !Number.isFinite(t.at) || typeof t.resolved !== "boolean") return null;
  const session = typeof t.session === "string" && t.session ? t.session : null, heard = Number.isInteger(t.heard) && t.heard >= 0 ? t.heard : 0;
  return { id: t.id, path: t.path, anchor, at: t.at, resolved: t.resolved, session, heard, exchanges: /** @type {Exchange[]} */ (list) };
}

/** Threads read back from localStorage or shared state: bad entries are dropped, since stored values may be old or foreign. @param {unknown} raw @returns {Thread[]} */
export function parseThreads(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(), out = [];
  for (const t of raw.slice(0, MAX_THREADS).map(parseThread)) if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
  return out;
}
