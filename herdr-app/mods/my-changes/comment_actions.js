// The comment bar under the diff: it writes a new comment on the selected lines, or replies to, collapses, resolves and deletes the clicked thread. It sits outside the virtual list because rows inside one cannot hold their own click handlers.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { makeAnchor, toUnified, anchorLabel } from "./comment_anchor.js";
import { commentKey } from "./comment_view.js";
import { waiting, isDraft, lastOf } from "./comment_threads.js";
import { sendLabel } from "./comment_batch.js";

/** @typedef {{ mode: "new", anchor: import("./comment_anchor.js").Anchor } | { mode: "thread", id: string }} Composer */

/** Opens the bar for a new comment on the selected lines. @param {any} host the Changes view @param {any} cx */
export function openComposer(host, cx) {
  if (!host.sel || !host.open) return;
  const lo = Math.min(host.sel.from, host.sel.to), hi = Math.max(host.sel.from, host.sel.to);
  const span = host.mode === "split" ? toUnified(host.split, host.rows, lo, hi) : { from: lo, to: hi };
  const anchor = span ? makeAnchor(host.rows, span.from, span.to) : null;
  if (!anchor) return;
  host.composer = { mode: "new", anchor };
  host.commentInput.set_value(""); host.commentInput.focus(); cx.notify();
}

/** @param {any} host @param {any} cx */
export function closeComposer(host, cx) { host.composer = null; host.commentInput.set_value(""); host.handle.focus(); cx.notify(); }

/** A click on an inline block: the Comment row opens the bar, a thread opens it for that thread. True when the key was a block's. @param {any} host @param {string} key @param {any} cx */
export function clickBlock(host, key, cx) {
  const hit = commentKey(key);
  if (!hit) return false;
  if (hit === "add") { openComposer(host, cx); return true; }
  const thread = host.comments.find(hit);
  host.composer = { mode: "thread", id: hit };
  // A draft opens with its text, so the bar edits it rather than stack a second comment.
  host.commentInput.set_value(thread && isDraft(thread) ? lastOf(thread).q : "");
  if (thread && !waiting(thread)) host.commentInput.focus();
  cx.notify();
  return true;
}

/** Saves what the bar holds as a draft: a new thread, a reply, or the open thread's edited draft. @param {any} host @param {any} cx */
export function submitComposer(host, cx) {
  const text = host.commentInput.value().trim(), c = host.composer;
  if (!text || !c || !host.root || !host.open) return;
  const where = { root: host.root, path: host.open }, thread = c.mode === "thread" ? host.comments.find(c.id) : null;
  if (c.mode === "new") host.comments.add({ ...where, anchor: c.anchor, text });
  else host.comments.act(thread && isDraft(thread) ? "edit" : "reply", { ...where, id: c.id, text });
  host.sel = null; host.publishComments();
  closeComposer(host, cx);
}

/** @param {any} host @param {string} op @param {string} id @param {any} cx */
function act(host, op, id, cx) {
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

/** The file bar's Send button beside Mark reviewed, or null with no drafts. @param {any} host @param {object} t theme */
export function sendButton(host, t) {
  const n = host.comments.drafts();
  if (!n) return null;
  return div().id("send-drafts").h(26).px(10).flex().flex_none().items_center().rounded(6).cursor_pointer().text_size(12).bg(t.raised).text_color(t.foreground)
    .hover((h) => h.bg(t.hover)).tooltip("Send every draft comment to the agent at once").on_click((_e, cx) => sendDrafts(host, cx)).child(sendLabel(n));
}

/** @param {object} t @param {{ id: string, label: string, click: Function, strong?: boolean }} spec */
const button = (t, { id, label, click, strong = false }) => div().id(id).h(24).px(9).flex().flex_none().items_center().rounded(6).text_size(11.5).cursor_pointer()
  .bg(strong ? t.solid : t.raised).text_color(strong ? t.solid_foreground : t.muted).hover((h) => h.bg(strong ? t.solid : t.hover).text_color(strong ? t.solid_foreground : t.foreground)).on_click(click).child(label);

/** The bar, or null when it is closed or its thread is gone. @param {any} host @param {object} t theme */
export function composerBar(host, t) {
  const c = host.composer, thread = c?.mode === "thread" ? host.comments.find(c.id) : null;
  if (!c || (c.mode === "thread" && !thread)) return null;
  const label = c.mode === "new" ? `Comment on ${anchorLabel(c.anchor)}` : `Thread on ${anchorLabel(thread.anchor)}`;
  const canWrite = c.mode === "new" || !waiting(thread), draft = thread && isDraft(thread), drafts = host.comments.drafts();
  const row = h_flex().gap(6).items_center().flex_wrap()
    .when(canWrite, (e) => e.child(button(t, { id: "cm-save", label: c.mode === "new" ? "Add draft" : draft ? "Save draft" : "Reply", click: (_e, cx) => submitComposer(host, cx), strong: true })))
    .when(drafts > 0, (e) => e.child(button(t, { id: "cm-send", label: sendLabel(drafts), click: (_e, cx) => { sendDrafts(host, cx); closeComposer(host, cx); } })))
    .when(Boolean(draft) && thread.exchanges.length > 1, (e) => e.child(button(t, { id: "cm-discard", label: "Discard draft", click: (_e, cx) => act(host, "discard", thread.id, cx) })));
  const actions = thread ? row
    .child(button(t, { id: "cm-collapse", label: host.comments.collapsed.has(thread.id) ? "Expand" : "Collapse", click: (_e, cx) => act(host, "collapse", thread.id, cx) }))
    .child(button(t, { id: "cm-resolve", label: thread.resolved ? "Reopen" : "Resolve", click: (_e, cx) => act(host, thread.resolved ? "reopen" : "resolve", thread.id, cx) }))
    .child(button(t, { id: "cm-delete", label: "Delete", click: (_e, cx) => act(host, "delete", thread.id, cx) })) : row;
  return v_flex().id("comment-bar").absolute().left(8).right(14).bottom(8).p(8).gap(6).rounded(8).bg(t.popover ?? t.background).border_1().border_color(t.accent).text_size(12)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(label)).child(button(t, { id: "cm-close", label: "Esc", click: (_e, cx) => closeComposer(host, cx) })))
    .when(canWrite, (e) => e.child(div().h(28).px(8).flex().items_center().rounded(6).border_1().border_color(t.border).child(Input.new(host.commentInput).h_full().text_size(12).text_color(t.foreground))))
    .child(actions);
}
