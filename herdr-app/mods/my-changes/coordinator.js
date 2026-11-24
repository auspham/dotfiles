// A coordinator edits nothing, so its Changes pane is empty; this points at the children whose work is in their own worktrees.

import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { run } from "herdr";
import { childrenOf } from "./children.js";

/** The note and one button per child, or null when the focused terminal is not a coordinator with children. */
export function coordinatorNote(t, all, focusedAddress) {
  const me = all.find((x) => x.address === focusedAddress);
  if (me?.labels?.role !== "coordinator") return null;
  const kids = childrenOf(all, focusedAddress);
  return v_flex().gap(6).p(8)
    .child(div().text_color(t.dim).child(kids.length
      ? "The coordinator edits no code. Open a child to see its changes:"
      : "The coordinator edits no code, and has no children yet."))
    .children(kids.map((k) => div().id(`child-${k.address}`).px(8).h(26).flex().items_center().rounded(6).bg(t.raised).cursor_pointer()
      .hover((h) => h.bg(t.hover)).text_color(t.foreground).on_click(() => run("agent.focus", { terminal: k.address }))
      .child(div().flex_1().min_w(0).truncate().child(`${k.task}${k.branch ? " on " + k.branch : ""}`))
      .when(k.yours, (e) => e.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Your turn")))));
}
