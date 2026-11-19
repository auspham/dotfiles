// tmux-style "kill-pane? (y/n)" for pane.close. Bind a key to mod.open:close-pane.
// y or Enter closes the pane that was focused when the dialog opened, n or Esc cancels.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, focused, closeOverlay, theme } from "herdr";

const CONFIRM_KEYS = ["y", "enter"];
const CANCEL_KEYS = ["n", "escape"];

export default class ClosePane extends View {
  /** @param {unknown} _props @param {any} cx */
  init(_props, cx) {
    /** @type {{ pane: string | null, terminal: string | null }} */
    this.target = { pane: focused()?.pane ?? null, terminal: focused()?.terminal ?? null };
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  dismiss() {
    /** @type {string | undefined} */
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
    else run("overlay.close", {});
  }

  confirm() {
    this.dismiss();
    if (this.target.pane) run("pane.close", { pane: this.target.pane });
  }

  /** @param {any} _cx */
  render(_cx) {
    const t = theme();
    const label = this.target.terminal ?? "this pane";
    /** @param {string} id @param {string} text @param {string} bg @param {string} fg @param {() => void} onClick */
    const button = (id, text, bg, fg, onClick) =>
      h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1().border_color(id === "no" ? t.input : bg).bg(bg).text_color(fg).cursor_pointer().hover((/** @type {any} */ s) => s.opacity(0.88)).on_click(onClick).child(text);
    return v_flex()
      .id("close-pane")
      .track_focus(this.handle)
      .on_key_down((/** @type {{ key: string }} */ e, /** @type {any} */ cx) => {
        if (CONFIRM_KEYS.includes(e.key)) this.confirm();
        else if (CANCEL_KEYS.includes(e.key)) this.dismiss();
        else return;
        cx.stop_propagation();
      })
      .size_full()
      .min_h(0)
      .p(18)
      .gap(12)
      .rounded(8)
      .bg(t.popover)
      .text_size(13)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child(`Close pane ${label}?`))
      .child(div().flex_1().min_h(0).text_color(t.muted).child("This ends its terminal."))
      .child(
        h_flex()
          .justify_end()
          .gap(8)
          .text_size(12)
          .child(button("no", "Cancel (n)", t.raised, t.foreground, () => this.dismiss()))
          .child(button("yes", "Close (y)", t.solid, t.solid_foreground, () => this.confirm())),
      );
  }
}
