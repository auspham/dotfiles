// The coordinator switch and the child model picker at the top of the Team panel.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { MODELS } from "./settings.js";

const toggle = (t, on, onToggle) =>
  h_flex().id("coordinator-toggle").gap(8).items_center().cursor_pointer().on_click(onToggle)
    .child(div().flex_none().size(16).rounded(4).border(1.5).border_color(on ? t.working : t.dim).when(on, (e) => e.bg(t.working))
      .flex().items_center().justify_center().text_size(11).text_color(t.background ?? "#000").child(on ? "✓" : ""))
    .child(div().font_semibold().text_color(t.foreground).child("Coordinator mode"));

const modelChip = (t, model, picked, onModel) =>
  div().id(`model-${model.id || "default"}`).px(8).h(22).rounded(5).flex().items_center().cursor_pointer().text_size(11)
    .when(picked, (e) => e.bg(t.working + "26")).text_color(picked ? t.working : t.muted)
    .hover((h) => h.bg(t.hover)).on_click((_e, cx) => onModel(model.id, cx)).child(model.label);

/** The switch, and while it is on, the model new child agents start with. */
export function coordinatorControls(t, settings, { onToggle, onModel }) {
  return v_flex().flex_none().gap(7).p(10).border_b(1).border_color(t.border)
    .child(toggle(t, settings.enabled, onToggle))
    .child(div().text_size(11).text_color(t.dim).child(settings.enabled
      ? "One agent here leads: it launches child agents in their own tabs and reviews them."
      : "Off: agents here work on their own. Switch on to have one agent coordinate the rest."))
    .when(settings.enabled, (e) => e.child(h_flex().gap(4).items_center()
      .child(div().flex_none().text_size(11).text_color(t.dim).mr(4).child("Child model"))
      .children(MODELS.map((m) => modelChip(t, m, m.id === settings.model, onModel)))));
}
