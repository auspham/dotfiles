// The coordinator switch and the model and effort pickers for child agents, at the top of the Team panel.

import { div, svg } from "gpui-kit";
import { Popup, v_flex, h_flex } from "gpui-base";
import { EFFORTS, MODELS } from "./settings.js";

const toggle = (t, on, onToggle) =>
  h_flex().id("coordinator-toggle").gap(8).items_center().cursor_pointer().on_click(onToggle)
    .child(div().flex_none().size(16).rounded(4).border(1.5).border_color(on ? t.working : t.dim).when(on, (e) => e.bg(t.working))
      .flex().items_center().justify_center().text_size(11).text_color(t.background ?? "#000").child(on ? "✓" : ""))
    .child(div().font_semibold().text_color(t.foreground).child("Coordinator mode"));

const option = (t, name, o, picked, onPick) =>
  h_flex().id(`${name}-${o.id || "default"}`).px(10).h(26).items_center().cursor_pointer().text_size(12)
    .text_color(picked ? t.working : t.foreground).hover((h) => h.bg(t.hover))
    .on_click((_e, cx) => onPick(o.id, cx)).child(o.label);

// A closed dropdown is its trigger; open, the list floats under it. Picking or pressing the trigger again closes it.
function dropdown(t, { name, title, options, value, open, onOpen, onPick }) {
  const current = options.find((o) => o.id === value) ?? options[0];
  const trigger = h_flex().id(`${name}-trigger`).gap(6).px(8).h(24).items_center().rounded(5).border(1).border_color(t.border)
    .cursor_pointer().hover((h) => h.bg(t.hover)).text_size(12).text_color(t.foreground)
    .on_click((_e, cx) => onOpen(open ? null : name, cx))
    .child(current.label).child(svg("mods/workspace-chrome/chevron-down.svg").size(11).flex_none().text_color(t.dim));
  const list = v_flex().py(4).min_w(130).rounded(6).bg(t.raised).border(1).border_color(t.border)
    .children(options.map((o) => option(t, name, o, o.id === value, (id, cx) => { onPick(id, cx); onOpen(null, cx); })));
  return h_flex().gap(8).items_center()
    .child(div().flex_none().text_size(11).text_color(t.dim).child(title))
    .child(Popup.new(`${name}-popup`, trigger).anchor("bottom_left").when(open, (e) => e.content(list)));
}

/** The switch and, while it is on, the model and effort new child agents start with. */
export function coordinatorControls(t, settings, menu, { onToggle, onModel, onEffort, onOpen }) {
  return v_flex().flex_none().gap(7).p(10).border_b(1).border_color(t.border)
    .child(toggle(t, settings.enabled, onToggle))
    .child(div().text_size(11).text_color(t.dim).child(settings.enabled
      ? "One agent here leads: it launches child agents in their own tabs and reviews them."
      : "Off: agents here work on their own. Switch on to have one agent coordinate the rest."))
    // Side by side while they fit, the second one drops to its own line when the panel is too narrow.
    .when(settings.enabled, (e) => e.child(h_flex().flex_wrap().gap_x(16).gap_y(7)
      .child(dropdown(t, { name: "model", title: "Model", options: MODELS, value: settings.model, open: menu === "model", onOpen, onPick: onModel }))
      .child(dropdown(t, { name: "effort", title: "Effort", options: EFFORTS, value: settings.effort, open: menu === "effort", onOpen, onPick: onEffort }))));
}
