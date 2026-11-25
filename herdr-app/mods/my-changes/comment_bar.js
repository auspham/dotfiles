// What the comment bar shows: its input's mode and labels, and whether the Send all strip is up. Pure: no herdr imports, so node can test it.

import { waiting, isDraft } from "./comment_threads.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {"new" | "reply" | "edit"} WriteMode */

const QUEUE_LABEL = { new: "Queue comment", reply: "Queue reply", edit: "Save changes" };

/** What the input writes, or null when the bar shows no input. A queued comment is only rewritten through Edit, since a reply under it would stack a second queued comment. @param {{ mode: "new" } | { mode: "thread", editing?: boolean } | null} composer @param {Thread | null} thread @returns {WriteMode | null} */
export function writeMode(composer, thread) {
  if (!composer) return null;
  if (composer.mode === "new") return "new";
  if (!thread || waiting(thread)) return null;
  if (isDraft(thread)) return composer.editing ? "edit" : null;
  return "reply";
}

/** The editor's primary button, or null when the bar shows no input. @param {WriteMode | null} mode */
export const queueLabel = (mode) => (mode ? QUEUE_LABEL[mode] : null);

const TITLE = { new: "New comment on", reply: "Reply on", edit: "Edit queued comment on" };

/** The editor's title. @param {WriteMode | null} mode @param {string} where the lines, as "Line 3" */
export const barTitle = (mode, where) => `${mode ? TITLE[mode] : "Thread on"} ${where}`;

/** The Send all strip's text. @param {number} n */
export const queuedText = (n) => `${n} comment${n === 1 ? "" : "s"} queued`;

/** Which parts of the bar show. The Send all strip depends only on the queue, so a closed or vanished thread never hides it. @param {{ mode: "new" } | { mode: "thread" } | null} composer @param {Thread | null} thread @param {number} queued */
export const barShows = (composer, thread, queued) => ({ editor: composer?.mode === "new" || Boolean(composer && thread), queue: queued > 0 });
