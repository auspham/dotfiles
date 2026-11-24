// Team: the agents that share this herdr space, what each is doing, and their messages to each other.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { checking, exec, focused, readTextFile, run, terminals, theme } from "herdr";
import { coordinatorBadge, reviewChip, taskLine } from "./badges.js";
import { chattyPairs, messageFeed, readTail } from "./feed.js";
import { coordinatorControls } from "./controls.js";
import { childSummary, parseSessions, spaceName, teamCards } from "./roster.js";
import { labelChanges, settingsFor, withSetting } from "./settings.js";
import { applyLabels, readSettings, writeSettings } from "./store.js";

const REFRESH_MS = 3000;
const TAIL_LINES = 150;
const MAX_AGENTS = 8;

const LIST_SESSIONS = 'ls "$HOME"/.claude/sessions/*.json 2>/dev/null';
const FIND_TRANSCRIPT = 'ls "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -1';

export default class Team extends View {
  init(_props, cx) {
    this.sessions = new Map(); this.tails = new Map(); this.paths = new Map();
    this.cards = []; this.loading = false; this.spaces = {}; this.menu = null;
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
  }

  // Reads the live session registry (names, never the credential files beside it) and each agent's transcript tail.
  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        await this.loadSessions();
        await this.loadSettings();
        await this.loadTails();
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  async loadSessions() {
    const files = (await exec("sh", ["-c", LIST_SESSIONS]).catch(() => ({ stdout: "" }))).stdout.split("\n").filter(Boolean);
    const texts = await Promise.all(files.map((file) => readTextFile(file).catch(() => null)));
    this.sessions = parseSessions(texts.filter(Boolean));
  }

  async loadSettings() {
    this.spaces = await readSettings();
  }

  // The screen updates at once, while cx is still valid; the file is then re-read and written so an edit
  // made elsewhere since the last refresh is not overwritten. cx is never used after an await.
  save(spaceId, patch, cx) {
    this.spaces = JSON.parse(withSetting(this.spaces, spaceId, patch)).spaces;
    cx.notify();
    return readSettings().then((fresh) => writeSettings(withSetting(fresh, spaceId, patch)));
  }

  // The hook and hcoord read the file; the role label on the leading agent is what the panel and sidebar show.
  async setCoordinatorMode(spaceId, on, cx) {
    await this.save(spaceId, { enabled: on }, cx);
    await applyLabels(labelChanges(this.cards, on, focused()?.terminal));
  }

  async transcriptOf(session) {
    if (!this.paths.has(session)) {
      const found = (await exec("sh", ["-c", FIND_TRANSCRIPT, "sh", session]).catch(() => ({ stdout: "" }))).stdout.trim();
      if (found) this.paths.set(session, found);
    }
    return this.paths.get(session) ?? null;
  }

  async loadTails() {
    const tails = new Map();
    await Promise.all(this.cards.slice(0, MAX_AGENTS).map(async (card) => {
      const path = card.session ? await this.transcriptOf(card.session) : null;
      if (!path) return;
      const out = await exec("tail", ["-n", String(TAIL_LINES), path]).catch(() => null);
      if (out) tails.set(card.address, { name: card.name, tail: readTail(out.stdout) });
    }));
    this.tails = tails;
  }

  statusMark(t, status) {
    if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (status === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  }

  card(t, c) {
    const doing = this.tails.get(c.address)?.tail;
    const line = c.question || doing?.lastTool || doing?.lastText || c.title;
    const task = taskLine(c);
    return v_flex().id(`team-${c.address}`).gap(3).p(9).rounded(8).bg(t.raised).cursor_pointer()
      .hover((h) => h.bg(t.hover))
      .on_click(() => run("agent.focus", { terminal: c.address }))
      .child(h_flex().gap(8).items_center()
        .child(this.statusMark(t, c.status))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).tooltip(`Session name: ${c.name}`).child(c.label))
        .when(c.role === "coordinator", (e) => e.child(coordinatorBadge(t)))
        .when(c.role === "child", (e) => e.child(reviewChip(t, c)))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(c.where || c.folder)))
      .when(task !== "", (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(task)))
      .child(div().min_w(0).truncate().text_size(11.5).text_color(c.question ? t.blocked : t.muted).child(line || "Nothing yet"));
  }

  feedRows(t, feed) {
    const labels = new Map(this.cards.map((c) => [c.name, c.label]));
    const show = (name) => labels.get(name) ?? name;
    if (!feed.length) return [div().text_size(11.5).text_color(t.dim).child("No messages yet. Agents message each other with SendMessage.")];
    return feed.map((m, i) => h_flex().id(`msg-${i}`).gap(6).text_size(11.5).items_start()
      .child(div().flex_none().font_semibold().text_color(t.foreground).child(`${show(m.from)} → ${show(m.to)}`))
      .child(div().flex_1().min_w(0).text_color(t.muted).child(m.text)));
  }

  feedSection(t) {
    const feed = messageFeed([...this.tails.values()]);
    const chatty = chattyPairs(feed, Date.now());
    return v_flex().gap(6).mt(6)
      .child(div().text_size(11).font_semibold().text_color(t.dim).child("Messages between agents"))
      .when(chatty.length > 0, (e) => e.child(div().p(7).rounded(6).bg(t.blocked + "26").text_size(11.5).text_color(t.blocked)
        .child(`${chatty.join(", ")} are messaging a lot. If it is a loop, tell one of them to stop.`)))
      .children(this.feedRows(t, feed));
  }

  render() {
    const t = theme();
    const all = terminals();
    const spaceId = focused()?.space;
    this.cards = teamCards({ terminals: all, sessions: this.sessions, spaceId });
    const summary = childSummary(this.cards);
    const heading = `${spaceName(all, spaceId) || "This space"} · ${this.cards.length} agent${this.cards.length === 1 ? "" : "s"}${summary ? " · " + summary : ""}`;
    return v_flex().size_full().text_size(12)
      .child(div().flex_none().h(36).px(12).flex().items_center().border_b(1).border_color(t.border).font_semibold().text_color(t.foreground).child(heading))
      .child(coordinatorControls(t, settingsFor(this.spaces, spaceId), this.menu, {
        onToggle: (_e, cx) => this.setCoordinatorMode(spaceId, !settingsFor(this.spaces, spaceId).enabled, cx),
        onModel: (model, cx) => this.save(spaceId, { model }, cx),
        onEffort: (effort, cx) => this.save(spaceId, { effort }, cx),
        onOpen: (menu, cx) => { this.menu = menu; cx.notify(); },
      }))
      .child(v_flex().id("team-list").flex_1().min_h(0).overflow_y_scroll().p(8).gap(7)
        .children(this.cards.map((c) => this.card(t, c)))
        .child(this.feedSection(t)));
  }
}
