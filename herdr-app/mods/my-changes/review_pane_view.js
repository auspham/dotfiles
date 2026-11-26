// The review pane: the file the Changes side panel picked, drawn with the panel's own file bar and diff.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme } from "herdr";
import { reviewChange } from "./review_pane.js";
import { paneRecord } from "./review_link.js";
import { listShown } from "./comment_list.js";
import { listView } from "./comment_list_view.js";

/** Takes in the panel's newest record: opens the file afresh, reloads an edited one in place, or only redraws the marks. Runs from a timer, never from render, since it changes state and notifies. @param {any} host the pane's Changes view @param {string} context its location key @param {any} cx */
export function syncPane(host, context, cx) {
  const record = paneRecord(), change = record ? reviewChange(host.record ?? null, record) : null;
  if (!change) return;
  host.record = record;
  cx.notify();
  if (change === "marks") return;
  Object.assign(host, { context, root: record.root, on: record.on, against: record.against, hasHead: record.hasHead, files: [{ ...record.file }] });
  if (change === "open") { host.pick(record.file.path, cx, true); return; }
  cx.spawn(async (cx) => { try { await host.load(record.file.path, context); } catch (e) { host.note = `Cannot preview this diff: ${e}`; } cx.notify(); });
}

/** Draws the review pane for the Changes view `host`, with the comment list on the right when it is wanted and fits; syncPane keeps it current. @param {any} host */
export function paneView(host) {
  const t = theme(), file = host.files[0] ?? null, splitting = host.mode === "split";
  const box = v_flex().id("review-pane").size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13);
  if (!file) return box.child(div().p(16).text_color(t.dim).child("Click a file in the Changes panel to review it here"));
  if (splitting) host.layoutSplit();
  // The file bar spans the pane, so its width says whether the list fits; the diff's own width shrinks when the list shows.
  const listed = listShown(host.listOn, host.drawn(host.barW));
  return box.child(host.fileBar(file, t))
    .child(h_flex().flex_1().min_h(0).child(host.diffBox(t, splitting).min_w(0).h_full()).when(listed, (e) => e.child(listView(host, t))))
    .when(Boolean(host.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(host.note)));
}
