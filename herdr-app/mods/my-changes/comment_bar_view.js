// The comment bar pinned under the diff: an editor for the open thread or new lines, and a Send all strip whenever comments are queued. It sits outside the virtual list because rows inside one cannot hold their own click handlers.

import { div } from "gpui-kit";
import { h_flex, v_flex, Textarea } from "gpui-base";
import { isDraft } from "./comment_threads.js";
import { headLabel } from "./comment_card.js";
import { SANS } from "./comment_card_view.js";
import { writeMode, queueLabel, barTitle, queuedText, barShows } from "./comment_bar.js";
import { closeComposer, submitComposer, sendDrafts, editQueued, act, barThread } from "./comment_actions.js";

/** @param {object} t @param {{ id: string, label: string, click: Function }} spec */
const textButton = (t, { id, label, click }) => div().id(id).h(28).px(8).flex().flex_none().items_center().rounded(6).cursor_pointer().text_color(t.muted)
  .hover((h) => h.bg(t.hover).text_color(t.foreground)).on_click(click).child(label);

/** @param {object} t @param {{ id: string, label: string, click: Function, dim?: boolean }} spec */
const primary = (t, { id, label, click, dim = false }) => div().id(id).h(30).px(14).flex().flex_none().items_center().rounded(6).cursor_pointer().font_semibold()
  .bg(t.solid).text_color(t.solid_foreground).when(dim, (e) => e.opacity(0.5)).on_click(click).child(label);

/** The open thread's secondary actions. @param {any} host @param {object} t @param {any} thread */
function threadButtons(host, t, thread) {
  const queued = isDraft(thread) && !host.composer.editing, collapsed = host.comments.collapsed.has(thread.id);
  const on = (op) => (_e, cx) => act(host, op, thread.id, cx);
  return [
    queued && textButton(t, { id: "cm-edit", label: "Edit", click: (_e, cx) => editQueued(host, thread, cx) }),
    queued && thread.exchanges.length > 1 && textButton(t, { id: "cm-unqueue", label: "Remove from queue", click: on("discard") }),
    textButton(t, { id: "cm-resolve", label: thread.resolved ? "Reopen" : "Resolve", click: on(thread.resolved ? "reopen" : "resolve") }),
    textButton(t, { id: "cm-collapse", label: collapsed ? "Expand" : "Collapse", click: on("collapse") }),
    textButton(t, { id: "cm-delete", label: "Delete", click: on("delete") }),
  ].filter(Boolean);
}

/** The editor: title, input and buttons for the open thread or the new comment. @param {any} host @param {object} t @param {any} thread */
function editor(host, t, thread) {
  const c = host.composer, mode = writeMode(c, thread), label = queueLabel(mode);
  const where = c.mode === "new" ? headLabel(c.anchor) : headLabel(thread.anchor);
  return v_flex().p(12).gap(8)
    .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).truncate().font_semibold().child(barTitle(mode, where)))
      .child(textButton(t, { id: "cm-close", label: "Close (Esc)", click: (_e, cx) => closeComposer(host, cx) }).text_size(12)))
    .when(Boolean(mode), (e) => e.child(div().px(10).py(6).rounded(6).border_1().border_color(host.typing ? t.accent : t.border).bg(t.background)
      .child(Textarea.new(host.commentInput).w_full().text_size(13).text_color(t.foreground))))
    .child(h_flex().gap(2).items_center().flex_wrap().children(thread ? threadButtons(host, t, thread) : []).child(div().flex_1())
      .when(Boolean(label), (e) => e.child(primary(t, { id: "cm-queue", label: label ?? "", dim: !host.hasComment, click: (_e, cx) => submitComposer(host, cx) }))));
}

/** The Send all strip: the queue's size and the one button that sends it. @param {any} host @param {object} t @param {number} n */
const queueStrip = (host, t, n) => h_flex().h(48).px(12).gap(10).items_center()
  .child(div().size(8).flex_none().rounded_full().bg(t.ansi3))
  .child(h_flex().flex_1().min_w(0).gap(6).items_baseline().child(div().font_medium().child(queuedText(n))).child(div().truncate().text_size(12).text_color(t.muted).child("not sent yet")))
  .child(primary(t, { id: "cm-send", label: `Send all (${n})`, click: (_e, cx) => sendDrafts(host, cx) }));

/** The bar, or null when nothing is open and nothing is queued. @param {any} host the Changes view @param {object} t theme */
export function composerBar(host, t) {
  const thread = barThread(host), queued = host.comments.drafts(), shows = barShows(host.composer, thread, queued);
  if (!shows.editor && !shows.queue) return null;
  return v_flex().id("comment-bar").flex_none().border_t_1().border_color(t.border).bg(t.raised).font_family(SANS).text_size(13).text_color(t.foreground)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_key_down((e, cx) => { if (e.key === "escape" && host.composer) { closeComposer(host, cx); cx.stop_propagation(); } })
    .when(shows.editor, (e) => e.child(editor(host, t, thread)))
    .when(shows.queue, (e) => e.child(queueStrip(host, t, queued).when(shows.editor, (s) => s.border_t_1().border_color(t.border))));
}
