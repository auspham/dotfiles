// The comment bar under the diff: it writes a new comment on the selected lines, or replies to, collapses, resolves and deletes the clicked thread. It sits outside the virtual list because rows inside one cannot hold their own click handlers.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { makeAnchor, toUnified, anchorLabel } from "./comment_anchor.js";
import { commentKey } from "./comment_view.js";
import { waiting } from "./comment_threads.js";

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
  host.composer = { mode: "thread", id: hit };
  host.commentInput.set_value("");
  if (!waiting(host.comments.find(hit) ?? { exchanges: [{ status: "done" }] })) host.commentInput.focus();
  cx.notify();
  return true;
}

/** Sends what the bar holds: a new thread, or a reply to the open one. @param {any} host @param {any} cx */
export function submitComposer(host, cx) {
  const text = host.commentInput.value().trim(), c = host.composer;
  if (!text || !c || !host.root || !host.open) return;
  const where = { root: host.root, path: host.open };
  if (c.mode === "new") host.comments.add({ ...where, anchor: c.anchor, text }, host.deliver, cx);
  else host.comments.act("reply", { ...where, id: c.id, text }, host.deliver, cx);
  host.sel = null; host.publishComments();
  closeComposer(host, cx);
}

/** @param {any} host @param {string} op @param {string} id @param {any} cx */
function act(host, op, id, cx) {
  if (op === "collapse") host.comments.toggle(id);
  else host.comments.act(op, { root: host.root, path: host.open, id }, host.deliver, cx);
  host.publishComments();
  closeComposer(host, cx);
}

/** @param {object} t @param {{ id: string, label: string, click: Function, strong?: boolean }} spec */
const button = (t, { id, label, click, strong = false }) => div().id(id).h(24).px(9).flex().flex_none().items_center().rounded(6).text_size(11.5).cursor_pointer()
  .bg(strong ? t.solid : t.raised).text_color(strong ? t.solid_foreground : t.muted).hover((h) => h.bg(strong ? t.solid : t.hover).text_color(strong ? t.solid_foreground : t.foreground)).on_click(click).child(label);

/** The bar, or null when it is closed or its thread is gone. @param {any} host @param {object} t theme */
export function composerBar(host, t) {
  const c = host.composer, thread = c?.mode === "thread" ? host.comments.find(c.id) : null;
  if (!c || (c.mode === "thread" && !thread)) return null;
  const label = c.mode === "new" ? `Comment on ${anchorLabel(c.anchor)}` : `Thread on ${anchorLabel(thread.anchor)}`;
  const canWrite = c.mode === "new" || !waiting(thread);
  const row = h_flex().gap(6).items_center().flex_wrap()
    .when(canWrite, (e) => e.child(button(t, { id: "cm-send", label: c.mode === "new" ? "Comment" : "Reply", click: (_e, cx) => submitComposer(host, cx), strong: true })));
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
