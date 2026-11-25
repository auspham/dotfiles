// Which comments go out together on Send, and the one file and one line that carry them to the agent. Pure: no herdr imports, so node can test it.

import { isDraft } from "./comment_threads.js";
import { commentNote } from "./comment_prompt.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */

/** @param {number} n */
const comments = (n) => `${n} comment${n === 1 ? "" : "s"}`;

/** The threads whose newest comment waits for Send. @param {Thread[]} threads */
export const draftsOf = (threads) => threads.filter(isDraft);

/** The threads of a batch still there at delivery: one deleted while the agent was busy is dropped. @param {Thread[]} threads @param {string[]} ids */
export const stillThere = (threads, ids) => threads.filter((t) => ids.includes(t.id));

/** Where a batch is written; `at` keeps a second Send from overwriting a file the agent has not read yet. @param {string} stateHome @param {number} at */
export const batchPath = (stateHome, at) => `${stateHome}/herdr-review/comments/batch-${at.toString(36)}.md`;

/** The batch file: every comment with its thread id, file, lines, diff and earlier exchanges. @param {Thread[]} threads */
export const batchNote = (threads) => `${comments(threads.length)} from the user's review. Answer each one by its thread id.\n\n${threads.map((t) => `## Thread ${t.id}\n\n${commentNote(t)}`).join("\n\n")}\n`;

/** The one line typed into the agent. hc send turns every newline into Enter, so the comments go in the file and the line carries none. @param {number} n @param {string} path */
export const batchLine = (n, path) => `[Review: ${comments(n)}] Read ${path.replace(/[\r\n]+/g, " ")}. Answer each with: hreview reply <id> "<answer>". If a comment asks for a change, make it in your worktree, commit, and say what you changed in the reply.`;

/** What Done reviewing adds to the coordinator's message, so it waits for the child's fixes instead of merging. @param {number} n comments delivered to the child agent */
export const sentSuffix = (n) => (n > 0 ? ` (${comments(n)} sent to the child)` : "");
