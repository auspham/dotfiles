// The review pane: the file the Changes side panel picked, drawn with the panel's own file bar and diff.

import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { theme } from "herdr";
import { needsReload } from "./review_pane.js";
import { paneRecord } from "./review_link.js";

/** Takes in the panel's newest record: loads the diff when the file or its content changed, else only redraws the marks. @param {any} host the pane's Changes view @param {string} context its location key @param {any} cx */
function sync(host, context, cx) {
  const record = paneRecord(), prev = host.record ?? null;
  if (!record || JSON.stringify(record) === JSON.stringify(prev)) return;
  host.record = record;
  if (!needsReload(prev, record)) return;
  Object.assign(host, { context, root: record.root, on: record.on, against: record.against, hasHead: record.hasHead, files: [{ ...record.file }] });
  host.pick(record.file.path, cx, true);
}

/** Draws the review pane for the Changes view `host`. @param {any} host @param {string} context @param {any} cx */
export function paneView(host, context, cx) {
  sync(host, context, cx);
  const t = theme(), file = host.files[0] ?? null, splitting = host.mode === "split";
  const box = v_flex().id("review-pane").size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13);
  if (!file) return box.child(div().p(16).text_color(t.dim).child("Click a file in the Changes panel to review it here"));
  if (splitting) host.layoutSplit();
  return box.child(host.fileBar(file, t)).child(host.diffBox(t, splitting))
    .when(Boolean(host.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(host.note)));
}
