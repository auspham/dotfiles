// A coordinator edits nothing, so its Changes pane is empty; this lists its children, those waiting for the user's review first.

import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { run } from "herdr";
import { childrenOf, reviewQueue } from "./children.js";

/** One child's button, with its state chip when it has one. @param {object} t @param {import("./children.js").QueuedChild} k */
function childRow(t, k) {
  return div().id(`child-${k.address}`).px(8).h(26).flex().items_center().rounded(6).bg(t.raised).cursor_pointer()
    .hover((h) => h.bg(t.hover)).text_color(t.foreground).on_click(() => run("agent.focus", { terminal: k.address }))
    .child(div().flex_1().min_w(0).truncate().child(`${k.task}${k.branch ? " on " + k.branch : ""}`))
    .when(Boolean(k.chip), (e) => e.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.ansi2 + "26").text_size(10.5).font_semibold().text_color(t.ansi2).child(k.chip)));
}

/** The "needs you" list and one button per child, or null when the focused terminal is not a coordinator. */
export function coordinatorNote(t, all, focusedAddress) {
  const me = all.find((x) => x.address === focusedAddress);
  if (me?.labels?.role !== "coordinator") return null;
  const kids = childrenOf(all, focusedAddress);
  if (!kids.length) return v_flex().p(8).child(div().text_color(t.dim).child("The coordinator edits no code, and has no children yet."));
  const queue = reviewQueue(kids);
  return v_flex().gap(6).p(8)
    .child(div().text_color(t.dim).child("The coordinator edits no code. Open a child to see its changes."))
    .child(div().font_semibold().text_color(queue.waiting.length ? t.blocked : t.dim).child(queue.heading))
    .children(queue.waiting.map((k) => childRow(t, k)))
    .when(queue.rest.length > 0, (e) => e.child(div().text_color(t.dim).child("Other children")))
    .children(queue.rest.map((k) => childRow(t, k)));
}
