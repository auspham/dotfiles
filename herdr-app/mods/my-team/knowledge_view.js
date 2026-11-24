// The collapsible Knowledge section of the Team panel.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { ledgerSummary } from "./knowledge.js";

const firstLine = (text) => text.split("\n")[0];

function childRow(t, c) {
  const tone = c.killed ? t.dim : c.verdict === "changes" ? t.blocked : c.verdict === "approved" ? t.done ?? t.working : t.muted;
  return v_flex().id(`knowledge-${c.name}`).w_full().min_w(0).gap(1).text_size(11.5)
    .child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(c.name))
      .when(c.verdict !== "", (e) => e.child(div().flex_none().text_size(10.5).text_color(tone).tooltip(c.note || c.verdict).child(c.verdict)))
      .child(div().flex_none().text_size(10.5).text_color(c.killed ? t.blocked : t.dim).child(c.event)))
    .when(c.branch !== "", (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(c.branch)))
    .when(c.task !== "", (e) => e.child(div().min_w(0).truncate().text_color(t.muted).tooltip(c.task).child(firstLine(c.task))));
}

function body(t, k, onZed) {
  const button = h_flex().id("knowledge-zed").flex_none().px(8).h(22).items_center().rounded(5).border(1).border_color(t.border)
    .cursor_pointer().hover((h) => h.bg(t.hover)).text_size(11.5).text_color(t.foreground).on_click(onZed).child("Open in Zed");
  return v_flex().gap(7).mt(6)
    .child(h_flex().gap(8).items_center().child(button)
      .when(k.note !== "", (e) => e.child(div().flex_1().min_w(0).text_size(11).text_color(t.blocked).child(k.note))))
    .child(v_flex().id("knowledge-notes").w_full().min_w(0).max_h(220).overflow_y_scroll().text_size(11.5)
      .text_color(k.notes ? t.muted : t.dim).child(k.notes ?? "No notes yet"))
    .children((k.children ?? []).map((c) => childRow(t, c)));
}

/**
 * The collapsible section. k is { open, notes, children, note }: the open state, the capped notes text or null,
 * the folded ledger or null, and a short failure note or "".
 */
export function knowledgeSection(t, k, { onToggle, onZed }) {
  const summary = ledgerSummary(k.children);
  return v_flex().flex_none().px(10).py(7).border_b(1).border_color(t.border)
    .child(h_flex().id("knowledge-header").gap(8).items_center().cursor_pointer().on_click(onToggle)
      .child(div().flex_none().text_size(11).text_color(t.dim).child(k.open ? "▾" : "▸"))
      .child(div().font_semibold().text_color(t.foreground).child("Knowledge"))
      .when(summary !== "", (e) => e.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(summary))))
    .when(k.open, (e) => e.child(body(t, k, onZed)));
}
