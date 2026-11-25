// Loads the coordinator's guide for the focused terminal and draws its banner above the file list.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { readTextFile, terminals, focused, exec, run, notify } from "herdr";
import { guidePath, parseGuide, headMoved, guideEntry, guideStats, canFinish, notifyTarget, shouldFinish, finishOutcome } from "./guide.js";

/** The guide in force for the Changes root, re-read when its file changes. */
export class GuideSource {
  constructor() { this.source = null; this.guide = null; this.head = ""; this.seen = new Set(); this.address = null; this.note = ""; this.busy = false; }

  /** Loads the guide the focused terminal's labels name; true the first time one loads for this root. @param {string} root @param {string} head @param {string | null} on @returns {Promise<boolean>} */
  async sync(root, head, on) {
    const term = terminals().find((x) => x.address === focused()?.terminal), cwd = term?.foreground?.cwd ?? term?.cwd ?? "";
    const path = cwd === root || cwd.startsWith(`${root}/`) ? guidePath(term?.labels) : null;
    this.head = head; this.address = path ? term.address : null;
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
    const reviewed = terminals().find((x) => x.address === this.address)?.labels?.review === "reviewed";
    const branch = host.range === "branch", items = branch ? host.files.map((f) => ({ level: host.levelFor(f), reviewed: host.reviewed(f) })) : [];
    return guideBanner(t, this.guide, branch ? guideStats(items) : null, { label: `Show since ${host.base?.name ?? "base"}`, run: (_e, cx) => host.setRange("branch", cx) }, { note: this.note, busy: this.busy, reviewed, run: (_e, cx) => this.finish(host, cx) });
  }

  /** Marks the focused child reviewed and tells its coordinator, then takes the user back to that coordinator with a toast. @param {any} host the Changes view @param {any} cx */
  finish(host, cx) {
    const labels = terminals().find((x) => x.address === this.address)?.labels;
    if (!shouldFinish(labels, this.busy)) return;
    this.busy = true;
    const target = notifyTarget(labels);
    cx.spawn(async (cx) => {
      try {
        const done = await exec("hc", ["label", this.address, "review=reviewed", "review_note=Reviewed by you"]).catch(() => null);
        const sent = done?.code === 0 && target ? await exec("hc", ["send", target.coord, target.text]).catch(() => null) : null;
        const out = finishOutcome(done?.code === 0, sent?.code === 0, target?.task ?? null);
        // One GuideSource serves every child, so a jump clears the note rather than carry it to the next one.
        this.note = out.note;
        // A refresh racing the jump could fill the coordinator's pane with this child's files, hiding its list.
        if (done?.code === 0 && !out.jump) host.refresh(cx);
        if (out.jump) run("agent.focus", { terminal: target.coord });
        if (out.toast) notify(out.toast);
      } finally { this.busy = false; cx.notify(); }
    });
  }

  /** @param {string} path @param {string} sig @returns {import("./guide.js").GuideEntry | null} */
  entry(path, sig) { return this.guide ? guideEntry(this.guide, path, sig, headMoved(this.guide, this.head)) : null; }
}

/** The banner, or null without a guide. @param {object} t theme @param {import("./guide.js").Guide | null} guide @param {ReturnType<typeof guideStats> | null} stats null outside the branch range, where counts mean nothing @param {{ label: string, run: Function }} onShow the Show-since button @param {{ note: string, busy: boolean, reviewed: boolean, run: Function }} onDone the Done reviewing button, its failure note, whether a finish is in flight and whether the child is already reviewed */
export function guideBanner(t, guide, stats, onShow, onDone) {
  if (!guide) return null;
  const counts = stats ? `${stats.needYou} need you, ${stats.normal} normal, ${stats.skim} skim` : "";
  return v_flex().id("guide-banner").flex_none().px(12).py(6).gap(3).border_b(1).border_color(t.border).text_size(11.5)
    .child(div().text_color(t.foreground).child(`Coordinator's review: ${guide.summary || guide.name}`))
    .child(h_flex().gap(8).items_center().flex_wrap()
      .when(Boolean(stats), (e) => e.child(div().text_color(t.muted).child(counts)).child(div().text_color(stats.done === stats.needYou ? t.ansi2 : t.blocked).child(`${stats.done}/${stats.needYou} need-you reviewed`)).child(doneButton(t, stats, onDone)).when(Boolean(onDone.note), (r) => r.child(div().text_color(t.blocked).child(onDone.note))))
      .when(!stats, (e) => e.child(div().id("guide-show").px(8).h(22).flex().items_center().rounded(5).bg(t.raised).text_color(t.foreground).cursor_pointer()
        .hover((h) => h.bg(t.hover)).on_click(onShow.run).child(onShow.label)).when(onDone.reviewed, (r) => r.child(reviewedMark(t)))));
}

/** The inert green mark that takes the Done reviewing button's place once the child is reviewed. @param {object} t */
const reviewedMark = (t) => div().id("guide-reviewed").px(8).h(22).flex().items_center().rounded(5).bg(t.ansi2 + "26").font_semibold().text_color(t.ansi2).child("Reviewed");

/** The Done reviewing button, dim and inert until canFinish. @param {object} t @param {ReturnType<typeof guideStats>} stats @param {{ busy: boolean, reviewed: boolean, run: Function }} onDone */
function doneButton(t, stats, onDone) {
  if (onDone.reviewed) return reviewedMark(t);
  const ready = canFinish(stats), b = div().id("guide-done").px(8).h(22).flex().items_center().rounded(5).bg(t.raised).child("Done reviewing");
  if (ready && onDone.busy) return b.text_color(t.dim);
  return ready
    ? b.text_color(t.foreground).cursor_pointer().hover((h) => h.bg(t.hover)).on_click(onDone.run)
    : b.text_color(t.dim).tooltip(`Tick every Look closely file first (${stats.done}/${stats.needYou})`);
}
