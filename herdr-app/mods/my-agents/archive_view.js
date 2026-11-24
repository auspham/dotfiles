// The collapsed 'Archived · N agents' row at the bottom of the list, and the dimmed rows it expands to.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run } from "herdr";
import { archivedLabel } from "./archive.js";

/**
 * @param {any} t theme
 * @param {any[]} hidden agents in archived spaces
 * @param {boolean} open
 * @param {(cx: any) => void} toggle
 */
export function archivedSection(t, hidden, open, toggle) {
  const name = (a) => `${a.space_name || a.address} · ${a.title || a.program?.name || a.address}`;
  const row = (a) => h_flex().id(`archived-${a.address}`).h(26).flex_none().px(8).items_center().rounded(8).cursor_pointer().opacity(0.55)
    .hover((s) => s.bg(t.hover))
    .on_click(() => run("agent.focus", { terminal: a.address }))
    .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(name(a)));
  return v_flex().flex_none().child(
    h_flex().id("archived-fold").h(28).flex_none().px(8).items_center().rounded(8).cursor_pointer().text_size(11.5).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => toggle(cx))
      .child(`${open ? "▾" : "▸"} ${archivedLabel(hidden.length)}`),
  ).children(open ? hidden.map(row) : []);
}
