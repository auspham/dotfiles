// The review pane's column of every comment thread in the folder, grouped by file. A click opens the thread's file and scrolls the diff to its card.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { chipView, SANS } from "./comment_card_view.js";
import { listGroups, countLabel, LIST_W, STATUS_LABEL } from "./comment_list.js";
import { requestJump } from "./review_link.js";

/** @typedef {import("./comment_list.js").ListRow} ListRow */

/** Opens the row's thread: unfolds it, asks the side panel for its file when another is open, and leaves the scroll to the diff once the card is drawn. @param {any} host the pane's Changes view @param {ListRow} row @param {any} cx */
function jumpTo(host, row, cx) {
  if (host.comments.collapsed.has(row.id)) host.comments.toggle(row.id);
  host.jump = { path: row.path, id: row.id, at: Date.now() };
  if (row.path !== host.open) requestJump(host.root, row.path);
  cx.notify();
}

/** @param {any} host @param {object} t theme @param {ListRow} row @param {boolean} clickable */
function rowView(host, t, row, clickable) {
  return v_flex().id(`cl-${row.id}`).px(12).py(6).gap(3).flex_none().when(row.status === "resolved", (e) => e.opacity(0.5))
    .when(clickable, (e) => e.cursor_pointer().hover((h) => h.bg(t.hover)).on_click((_e, cx) => jumpTo(host, row, cx)))
    .child(h_flex().gap(6).items_center()
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(row.label))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(`${row.replies} repl${row.replies === 1 ? "y" : "ies"}`))
      .child(chipView(t, { label: STATUS_LABEL[row.status], tone: row.status })))
    .child(div().truncate().text_color(t.foreground).child(row.first || " "));
}

/** The column: a header with the counts, then each file's threads. With none, the header alone says so. @param {any} host the pane's Changes view @param {object} t theme */
export function listView(host, t) {
  const groups = listGroups(host.list);
  const box = v_flex().w(LIST_W).flex_none().h_full().min_h(0).border_l_1().border_color(t.border).bg(t.background).font_family(SANS).text_size(12)
    .child(div().h(32).flex_none().px(12).flex().items_center().border_b_1().border_color(t.border).text_color(t.muted).font_medium().child(countLabel(host.list)));
  if (!groups.length) return box;
  return box.child(v_flex().id("comment-list").flex_1().min_h(0).overflow_y_scrollbar().pb(8)
    .children(groups.flatMap((g) => [
      h_flex().px(12).pt(10).pb(4).gap(6).flex_none().items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(11).font_medium().text_color(g.inDiff ? t.foreground : t.dim).child(g.path))
        .when(!g.inDiff, (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child("not in this range"))),
      ...g.rows.map((row) => rowView(host, t, row, g.inDiff)),
    ])));
}
