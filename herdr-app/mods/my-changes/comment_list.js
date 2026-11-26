// The review pane's list of every comment thread in the folder: the rows the side panel publishes for it, and how the pane orders, groups and counts them. Pure: no herdr imports, so node can test it.

import { anchorLabel, quotedLines } from "./comment_anchor.js";
import { threadChip } from "./comment_status.js";
import { firstLine, replyCount } from "./comment_card.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {import("./comment_status.js").ChipTone} ChipTone */
/** order: the file's place in the diff, -1 when the current range does not show it; line: the first line quoted, for sorting. */
/** @typedef {{ id: string, path: string, order: number, label: string, line: number, status: ChipTone, first: string, replies: number }} ListRow */
/** @typedef {{ path: string, inDiff: boolean, rows: ListRow[] }} ListGroup */

export const JUMP_KEY = "review.jump";
// The column's width, and the narrowest diff beside it; a narrower pane hides the column.
export const LIST_W = 280;
export const MIN_DIFF_W = 480;
const FIRST_MAX = 120;
export const STATUS_LABEL = { queued: "Queued", waiting: "Waiting", answered: "Answered", resolved: "Resolved", failed: "Failed" };

/** The shared key that carries one tab's list of every thread in its folder. @param {string} tab */
export const listKey = (tab) => `review.list.${tab}`;

/** A thread as one row of the list. @param {Thread} t @param {string[]} paths the diff's files, in its order @returns {ListRow} */
export function listRow(t, paths) {
  return { id: t.id, path: t.path, order: paths.indexOf(t.path), label: anchorLabel(t.anchor), line: Math.min(...quotedLines(t.anchor)), status: threadChip(t).tone, first: firstLine(t).slice(0, FIRST_MAX), replies: replyCount(t) };
}

/** Rows grouped by file: files in diff order, then those the range does not show by path; in each, open threads by line and the resolved ones after. @param {ListRow[]} rows @returns {ListGroup[]} */
export function listGroups(rows) {
  const place = (r) => (r.order < 0 ? Infinity : r.order);
  const sorted = [...rows].sort((a, b) => place(a) - place(b) || a.path.localeCompare(b.path)
    || Number(a.status === "resolved") - Number(b.status === "resolved") || a.line - b.line);
  const groups = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (last?.path === row.path) last.rows.push(row);
    else groups.push({ path: row.path, inDiff: row.order >= 0, rows: [row] });
  }
  return groups;
}

/** The list's header: "4 comments, 1 open", or the one line shown when there are none. @param {ListRow[]} rows */
export function countLabel(rows) {
  if (!rows.length) return "No comments in this folder";
  const open = rows.filter((r) => r.status !== "resolved").length;
  return `${rows.length} comment${rows.length === 1 ? "" : "s"}, ${open} open`;
}

/** Whether the column shows: the user wants it and the pane leaves the diff its room. @param {boolean} wanted @param {number} paneW drawn px */
export const listShown = (wanted, paneW) => wanted && paneW >= LIST_W + MIN_DIFF_W;

const isText = (v) => typeof v === "string" && v.length > 0;
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isRow = (r) => Boolean(r) && isText(r.id) && isText(r.path) && Number.isInteger(r.order) && r.order >= -1 && isText(r.label)
  && Number.isInteger(r.line) && r.line >= 0 && Object.keys(STATUS_LABEL).includes(r.status) && typeof r.first === "string" && isCount(r.replies);

/** The rows the pane received, or an empty list unless they are for its folder; bad rows are dropped, since shared values may be old or foreign. @param {unknown} v @param {string | null} root @returns {ListRow[]} */
export function parseList(v, root) {
  const s = /** @type {any} */ (v);
  if (!root || !s || typeof s !== "object" || s.root !== root || !Array.isArray(s.rows)) return [];
  return s.rows.filter(isRow).map(({ id, path, order, label, line, status, first, replies }) => ({ id, path, order, label, line, status, first, replies }));
}
