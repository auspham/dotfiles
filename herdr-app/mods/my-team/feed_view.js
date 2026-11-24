// The collapsible, scrollable "Messages between agents" section of the Team panel.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { feedCount, firstLine, messageKey } from "./feed.js";

const LIST_HEIGHT = 320;

function messageRow(t, m, { who, expanded, onExpand }) {
  const key = messageKey(m);
  const open = expanded.has(key);
  return v_flex().id(`msg-${key}`).w_full().min_w(0).gap(1).text_size(11.5).cursor_pointer().on_click((_e, cx) => onExpand(key, cx))
    .child(div().w_full().min_w(0).truncate().font_semibold().text_color(t.foreground).child(`${who(m.from)} → ${who(m.to)}`))
    .child(open
      ? div().w_full().min_w(0).text_color(t.muted).child(m.text)
      : div().w_full().min_w(0).truncate().text_color(t.muted).child(firstLine(m.text)));
}

/**
 * The section. v is { feed, chatty, who, open, expanded }: the messages newest first, the pairs messaging a lot,
 * a name-to-label function, whether the list is open and the set of expanded message keys.
 */
export function messagesSection(t, v, { onToggle, onExpand }) {
  return v_flex().w_full().min_w(0).gap(8).mt(6)
    .child(h_flex().id("messages-header").gap(8).items_center().cursor_pointer().on_click(onToggle)
      .child(div().flex_none().text_size(11).text_color(t.dim).child(v.open ? "▾" : "▸"))
      .child(div().text_size(11).font_semibold().text_color(t.dim).child("Messages between agents"))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(feedCount(v.feed.length))))
    .when(v.chatty.length > 0, (e) => e.child(div().w_full().min_w(0).p(7).rounded(6).bg(t.blocked + "26").text_size(11.5).text_color(t.blocked)
      .child(`${v.chatty.join(", ")} are messaging a lot. If it is a loop, tell one of them to stop.`)))
    .when(v.open && v.feed.length === 0, (e) => e.child(div().w_full().min_w(0).text_size(11.5).text_color(t.dim).child("No messages yet. Agents message each other with SendMessage.")))
    .when(v.open && v.feed.length > 0, (e) => e.child(v_flex().id("messages-list").w_full().min_w(0).max_h(LIST_HEIGHT).overflow_y_scroll().gap(8)
      .children(v.feed.map((m) => messageRow(t, m, { who: v.who, expanded: v.expanded, onExpand })))));
}
