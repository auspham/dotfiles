// What the comment bar and the inline cards do: open the bar on a thread or new lines, queue what is typed, act on a thread, and send the queue.

import { makeAnchor, toUnified } from "./comment_anchor.js";
import { commentKey } from "./comment_view.js";
import { lastOf } from "./comment_threads.js";
import { writeMode } from "./comment_bar.js";

/** editing: the thread's queued comment is in the input, through Edit. */
/** @typedef {{ mode: "new", anchor: import("./comment_anchor.js").Anchor } | { mode: "thread", id: string, editing?: boolean }} Composer */

/** Fills the input and records whether it holds text. set_value fires no change event, and a stale record would stop typing from redrawing the bar's Queue or Send all button. @param {any} host @param {string} text */
function setInput(host, text) { host.commentInput.set_value(text); host.hasComment = Boolean(text.trim()); }

/** Opens the bar for a new comment on the selected lines. @param {any} host the Changes view @param {any} cx */
export function openComposer(host, cx) {
  if (!host.sel || !host.open) return;
  const lo = Math.min(host.sel.from, host.sel.to), hi = Math.max(host.sel.from, host.sel.to);
  const span = host.mode === "split" ? toUnified(host.split, host.rows, lo, hi) : { from: lo, to: hi };
  const anchor = span ? makeAnchor(host.rows, span.from, span.to) : null;
  if (!anchor) return;
  host.composer = { mode: "new", anchor };
  setInput(host, ""); host.commentInput.focus(); cx.notify();
}

/** @param {any} host @param {any} cx */
export function closeComposer(host, cx) { host.composer = null; setInput(host, ""); host.handle.focus(); cx.notify(); }

/** A click on an inline block: the Comment row opens the bar, a thread opens it for that thread. True when the key was a block's. @param {any} host @param {string} key @param {any} cx */
export function clickBlock(host, key, cx) {
  const hit = commentKey(key);
  if (!hit) return false;
  if (hit === "add") { openComposer(host, cx); return true; }
  host.composer = { mode: "thread", id: hit };
  setInput(host, "");
  if (writeMode(host.composer, host.comments.find(hit) ?? null)) host.commentInput.focus();
  cx.notify();
  return true;
}

/** Puts the thread's queued comment in the input to rewrite it. @param {any} host @param {any} thread @param {any} cx */
export function editQueued(host, thread, cx) {
  host.composer = { mode: "thread", id: thread.id, editing: true };
  setInput(host, lastOf(thread).q); host.commentInput.focus(); cx.notify();
}

/** Queues what the bar holds: a new thread, a reply, or the thread's rewritten queued comment. @param {any} host @param {any} cx */
export function submitComposer(host, cx) {
  const text = host.commentInput.value().trim(), c = host.composer, mode = writeMode(c, barThread(host));
  if (!text || !mode || !host.root || !host.open) return;
  const where = { root: host.root, path: host.open };
  if (c.mode === "new") host.comments.add({ ...where, anchor: c.anchor, text });
  else host.comments.act(mode, { ...where, id: c.id, text });
  host.sel = null; host.publishComments();
  closeComposer(host, cx);
}

/** @param {any} host @param {string} op @param {string} id @param {any} cx */
export function act(host, op, id, cx) {
  if (op === "collapse") host.comments.toggle(id);
  else host.comments.act(op, { root: host.root, path: host.open, id });
  host.publishComments();
  closeComposer(host, cx);
}

/** Sends every draft as one batch; from the review pane, through the side panel. @param {any} host @param {any} cx */
export function sendDrafts(host, cx) {
  if (!host.root) return null;
  // Drafts outlive a reload, so the panel sends them with no file open; only the pane's request names one.
  const batch = host.comments.send({ root: host.root, path: host.open ?? "" }, host.sendDrafts, cx);
  host.publishComments(); cx.notify();
  return batch;
}

/** The open thread, or null for a new comment or a closed bar. @param {any} host */
export const barThread = (host) => (host.composer?.mode === "thread" ? host.comments.find(host.composer.id) ?? null : null);
