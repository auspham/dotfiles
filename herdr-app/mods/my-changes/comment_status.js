// The status chip a thread's header shows, from its newest comment. Pure: no herdr imports, so node can test it.

import { lastOf } from "./comment_threads.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {import("./comment_threads.js").Exchange} Exchange */
/** @typedef {"queued" | "waiting" | "answered" | "resolved" | "failed"} ChipTone */
/** @typedef {{ label: string, tone: ChipTone }} Chip */

/** @param {Exchange} e @returns {Chip} */
const waitingFor = (e) => ({ label: `Waiting for ${e.to?.name ?? "an answer"}`, tone: "waiting" });

/** @type {Record<import("./comment_threads.js").Status, (e: Exchange) => Chip>} */
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

/** The chip for a thread: Resolved, or what its newest comment waits on. @param {Thread} t @returns {Chip} */
export const threadChip = (t) => (t.resolved ? { label: "Resolved", tone: "resolved" } : BY_STATUS[lastOf(t).status](lastOf(t)));
