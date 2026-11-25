// What the comment bar's input and its one primary button do, from the bar's thread, the typed text and the queue. Pure: no herdr imports, so node can test it.

import { waiting, isDraft } from "./comment_threads.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {"new" | "reply" | "edit"} WriteMode */
/** @typedef {{ kind: "queue" | "send", label: string }} BarAction */

const QUEUE_LABEL = { new: "Queue comment", reply: "Queue reply", edit: "Save changes" };

/** What the input writes, or null when the bar shows no input. A queued comment is only rewritten through Edit, since a reply under it would stack a second queued comment. @param {{ mode: "new" } | { mode: "thread", editing?: boolean } | null} composer @param {Thread | null} thread @returns {WriteMode | null} */
export function writeMode(composer, thread) {
  if (!composer) return null;
  if (composer.mode === "new") return "new";
  if (!thread || waiting(thread)) return null;
  if (isDraft(thread)) return composer.editing ? "edit" : null;
  return "reply";
}

/** The primary button: queue what is typed, else send the queue, else none. @param {{ typed: boolean, queued: number, mode: WriteMode | null }} state @returns {BarAction | null} */
export function barAction({ typed, queued, mode }) {
  if (typed && mode) return { kind: "queue", label: QUEUE_LABEL[mode] };
  if (queued > 0) return { kind: "send", label: `Send all (${queued})` };
  return null;
}

/** The bar's title. @param {WriteMode | null} mode @param {string} where the thread's lines, as "line 3" @param {number} queued */
export function barTitle(mode, where, queued) {
  if (mode === "new") return `New comment on ${where}`;
  if (where) return `Thread on ${where}`;
  return `${queued} comment${queued === 1 ? "" : "s"} queued, not sent yet`;
}

/** Which parts of the bar show. The Send all strip depends only on the queue, so a closed or vanished thread never hides it. @param {{ mode: "new" } | { mode: "thread" } | null} composer @param {Thread | null} thread @param {number} queued */
export const barShows = (composer, thread, queued) => ({ editor: composer?.mode === "new" || Boolean(composer && thread), queue: queued > 0 });
