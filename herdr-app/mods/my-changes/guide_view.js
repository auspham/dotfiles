// Loads the coordinator's guide for the focused terminal and draws its banner above the file list.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { readTextFile, terminals, focused } from "herdr";
import { guidePath, parseGuide, headMoved, guideEntry, guideStats } from "./guide.js";

/** The guide in force for the Changes root, re-read when its file changes. */
export class GuideSource {
  constructor() { this.source = null; this.guide = null; this.head = ""; this.seen = new Set(); }

  /** Loads the guide the focused terminal's labels name; true the first time one loads for this root. @param {string} root @param {string} head @param {string | null} on @returns {Promise<boolean>} */
  async sync(root, head, on) {
    const term = terminals().find((x) => x.address === focused()?.terminal), cwd = term?.foreground?.cwd ?? term?.cwd ?? "";
    const path = cwd === root || cwd.startsWith(`${root}/`) ? guidePath(term?.labels) : null;
    this.head = head;
    if (!path) { this.source = null; this.guide = null; return false; }
    const source = await readTextFile(path, { on }).catch(() => null);
    if (source === null) { this.source = null; this.guide = null; return false; }
    if (source !== this.source) { this.source = source; this.guide = parseGuide(source); }
    if (!this.guide || this.seen.has(root)) return false;
    this.seen.add(root);
    return true;
  }

  /** The banner for the Changes view `host`, or null without a guide. @param {object} t theme @param {any} host the Changes view */
  bar(t, host) {
    const branch = host.range === "branch", items = branch ? host.files.map((f) => ({ entry: host.guideEntry(f), reviewed: host.reviewed(f) })) : [];
    return guideBanner(t, this.guide, branch ? guideStats(items) : null, { label: `Show since ${host.base?.name ?? "base"}`, run: (_e, cx) => host.setRange("branch", cx) });
  }

  /** @param {string} path @param {string} sig @returns {import("./guide.js").GuideEntry | null} */
  entry(path, sig) { return this.guide ? guideEntry(this.guide, path, sig, headMoved(this.guide, this.head)) : null; }
}

/** The banner, or null without a guide. @param {object} t theme @param {import("./guide.js").Guide | null} guide @param {ReturnType<typeof guideStats> | null} stats null outside the branch range, where counts mean nothing @param {{ label: string, run: Function }} onShow the Show-since button */
export function guideBanner(t, guide, stats, onShow) {
  if (!guide) return null;
  const counts = stats ? `${stats.needYou} need you, ${stats.normal} normal, ${stats.skim} skim` : "";
  return v_flex().id("guide-banner").flex_none().px(12).py(6).gap(3).border_b(1).border_color(t.border).text_size(11.5)
    .child(div().text_color(t.foreground).child(`Coordinator's review: ${guide.summary || guide.name}`))
    .child(h_flex().gap(8).items_center().flex_wrap()
      .when(Boolean(stats), (e) => e.child(div().text_color(t.muted).child(counts)).child(div().text_color(stats.done === stats.needYou ? t.ansi2 : t.blocked).child(`${stats.done}/${stats.needYou} need-you reviewed`)))
      .when(!stats, (e) => e.child(div().id("guide-show").px(8).h(22).flex().items_center().rounded(5).bg(t.raised).text_color(t.foreground).cursor_pointer()
        .hover((h) => h.bg(t.hover)).on_click(onShow.run).child(onShow.label))));
}
