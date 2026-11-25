// The comment bar under the diff: one primary button queues what is typed or sends the queue, beside the clicked thread's secondary actions. It sits outside the virtual list because rows inside one cannot hold their own click handlers.

import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { makeAnchor, toUnified, anchorLabel } from "./comment_anchor.js";
import { commentKey } from "./comment_view.js";
import { isDraft, lastOf } from "./comment_threads.js";
import { writeMode, barAction, barTitle } from "./comment_bar.js";

/** editing: the thread's queued comment is in the input, through Edit. */
/** @typedef {{ mode: "new", anchor: import("./comment_anchor.js").Anchor } | { mode: "thread", id: string, editing?: boolean }} Composer */

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
  if (writeMode(host.composer, host.comments.find(hit) ?? null)) host.commentInput.focus();
  cx.notify();
  return true;
}

/** Puts the thread's queued comment in the input to rewrite it. @param {any} host @param {any} thread @param {any} cx */
function editQueued(host, thread, cx) {
  host.composer = { mode: "thread", id: thread.id, editing: true };
  host.commentInput.set_value(lastOf(thread).q); host.commentInput.focus(); cx.notify();
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

/** The open thread, or null for a new comment or a closed bar. @param {any} host */
const barThread = (host) => (host.composer?.mode === "thread" ? host.comments.find(host.composer.id) ?? null : null);

/** @param {object} t @param {{ id: string, label: string, click: Function, strong?: boolean }} spec */
const button = (t, { id, label, click, strong = false }) => div().id(id).h(26).px(10).flex().flex_none().items_center().rounded(6).text_size(12).cursor_pointer()
  .when(strong, (e) => e.font_semibold().bg(t.solid).text_color(t.solid_foreground))
  .when(!strong, (e) => e.border_1().border_color(t.border).text_color(t.foreground).hover((h) => h.bg(t.hover)))
  .on_click(click).child(label);

/** The secondary buttons for the bar's thread. @param {any} host @param {object} t @param {any} thread */
function threadButtons(host, t, thread) {
  const queued = isDraft(thread) && !host.composer.editing, collapsed = host.comments.collapsed.has(thread.id);
  return [
    queued && button(t, { id: "cm-edit", label: "Edit", click: (_e, cx) => editQueued(host, thread, cx) }),
    queued && thread.exchanges.length > 1 && button(t, { id: "cm-unqueue", label: "Remove from queue", click: (_e, cx) => act(host, "discard", thread.id, cx) }),
    button(t, { id: "cm-resolve", label: thread.resolved ? "Reopen" : "Resolve", click: (_e, cx) => act(host, thread.resolved ? "reopen" : "resolve", thread.id, cx) }),
    button(t, { id: "cm-collapse", label: collapsed ? "Expand" : "Collapse", click: (_e, cx) => act(host, "collapse", thread.id, cx) }),
    button(t, { id: "cm-delete", label: "Delete", click: (_e, cx) => act(host, "delete", thread.id, cx) }),
  ].filter(Boolean);
}

/** The primary button from what is typed and queued, or null. @param {any} host @param {object} t @param {import("./comment_bar.js").WriteMode | null} mode */
function primaryButton(host, t, mode) {
  const action = barAction({ typed: Boolean(host.commentInput.value().trim()), queued: host.comments.drafts(), mode });
  if (!action) return null;
  const click = action.kind === "queue" ? (_e, cx) => submitComposer(host, cx) : (_e, cx) => { sendDrafts(host, cx); closeComposer(host, cx); };
  return button(t, { id: "cm-primary", label: action.label, click, strong: true });
}

/** The bar: open on a thread or new lines, or showing Send all while comments are queued; null otherwise. @param {any} host @param {object} t theme */
export function composerBar(host, t) {
  const c = host.composer, thread = barThread(host), queued = host.comments.drafts();
  if (c?.mode === "thread" && !thread) return null;
  if (!c && !queued) return null;
  const mode = writeMode(c, thread), where = c?.mode === "new" ? anchorLabel(c.anchor) : thread ? anchorLabel(thread.anchor) : "";
  return v_flex().id("comment-bar").absolute().left(8).right(14).bottom(8).p(8).gap(6).rounded(8).bg(t.popover ?? t.background).border_1().border_color(t.accent).text_size(12)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).truncate().text_color(t.foreground).font_semibold().child(barTitle(mode, where, queued)))
      .when(Boolean(c), (e) => e.child(button(t, { id: "cm-close", label: "Esc", click: (_e, cx) => closeComposer(host, cx) }))))
    .when(Boolean(mode), (e) => e.child(div().h(28).px(8).flex().items_center().rounded(6).border_1().border_color(t.border).child(Input.new(host.commentInput).h_full().text_size(12).text_color(t.foreground))))
    .child(h_flex().gap(6).items_center().flex_wrap().children(thread ? threadButtons(host, t, thread) : []).child(div().flex_1()).children([primaryButton(host, t, mode)].filter(Boolean)));
}
