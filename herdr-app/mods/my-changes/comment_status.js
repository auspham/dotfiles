// The status chip a thread's header shows, from its newest comment. Pure: no herdr imports, so node can test it.

import { lastOf } from "./comment_threads.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {import("./comment_threads.js").Exchange} Exchange */
/** @typedef {"queued" | "waiting" | "answered" | "resolved" | "failed"} ChipTone */
/** @typedef {{ label: string, tone: ChipTone }} Chip */

/** An agent's short name: its task label from `names` (by terminal address), else the name stored at send, which is often a long tab title. @param {import("./comment_threads.js").Agent | null} to @param {Record<string, string>} names */
export const agentName = (to, names) => (to ? names[to.address] || to.name : "Claude");

/** @param {Exchange} e @param {Record<string, string>} names @returns {Chip} */
const waitingFor = (e, names) => ({ label: e.to ? `Waiting for ${agentName(e.to, names)}` : "Waiting for an answer", tone: "waiting" });

/** @type {Record<import("./comment_threads.js").Status, (e: Exchange, names: Record<string, string>) => Chip>} */
const BY_STATUS = {
  // A queued comment whose batch failed keeps the reason in `a` and goes out again with the next Send all.
  draft: (e) => (e.a ? { label: "Not sent", tone: "failed" } : { label: "Queued", tone: "queued" }),
  held: waitingFor,
  sent: waitingFor,
  pending: waitingFor,
  done: () => ({ label: "Answered", tone: "answered" }),
  // The comment went out; the answer failed or was cut off.
  error: () => ({ label: "No answer", tone: "failed" }),
};

/** The chip for a thread: Resolved, or what its newest comment waits on. @param {Thread} t @param {Record<string, string>} [names] task labels by terminal address @returns {Chip} */
export const threadChip = (t, names = {}) => (t.resolved ? { label: "Resolved", tone: "resolved" } : BY_STATUS[lastOf(t).status](lastOf(t), names));

/** Task labels of the coordinator's children by terminal address, so a thread names "farewell" and not its tab title. @param {{ address: string, labels?: Record<string, string> }[]} all */
export const taskNames = (all) => Object.fromEntries(all.filter((x) => x.labels?.task).map((x) => [x.address, String(x.labels?.task)]));
