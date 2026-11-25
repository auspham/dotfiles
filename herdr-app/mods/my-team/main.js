// Team: the agents that share this herdr space, what each is doing, and their messages to each other.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { checking, exec, focused, readTextFile, run, terminals, theme } from "herdr";
import { coordinatorBadge, lentNote, reviewChip, taskLine } from "./badges.js";
import { chattyPairs, messageFeed, readTail } from "./feed.js";
import { messagesSection } from "./feed_view.js";
import { coordinatorControls } from "./controls.js";
import { knowledgeSection } from "./knowledge_view.js";
import { childSummary, parseSessions, resolveTarget, spaceName, teamCards } from "./roster.js";
import { labelChanges, settingsFor, withSetting } from "./settings.js";
import { applyLabels, openInZed, readKnowledge, readSettings, writeSettings } from "./store.js";

const REFRESH_MS = 3000;
const TAIL_LINES = 150;
const MAX_AGENTS = 8;
const CHILD_INDENT = 14;

const LIST_SESSIONS = 'ls "$HOME"/.claude/sessions/*.json 2>/dev/null';
const FIND_TRANSCRIPT = 'ls "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -1';

export default class Team extends View {
  init(_props, cx) {
    this.sessions = new Map(); this.tails = new Map(); this.paths = new Map();
    this.cards = []; this.loading = false; this.spaces = {}; this.menu = null;
    this.messages = { open: true, expanded: new Set() };
    this.knowledge = { open: false, notes: null, children: null, note: "" };
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
        await this.loadKnowledge();
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

  async loadKnowledge() {
    const { dir, notes, children } = await readKnowledge(focused()?.space);
    this.knowledgeDir = dir;
    Object.assign(this.knowledge, { notes, children });
  }

  openKnowledge(cx) {
    if (!this.knowledgeDir) return;
    cx.spawn(async (cx) => {
      this.knowledge.note = await openInZed(this.knowledgeDir);
      cx.notify();
    });
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

  // The hook and hcoord read the file; the role labels on the agents are what the panel and sidebar show.
  async setCoordinatorMode(spaceId, on, cx) {
    await this.save(spaceId, { enabled: on }, cx);
    await applyLabels(labelChanges(this.cards, on));
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
      .when(c.coordName !== "", (e) => e.ml(CHILD_INDENT)).hover((h) => h.bg(t.hover))
      .on_click(() => run("agent.focus", { terminal: c.address }))
      .child(h_flex().gap(8).items_center()
        .child(this.statusMark(t, c.status))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).tooltip(`Session name: ${c.name}`).child(c.label))
        .when(c.role === "coordinator", (e) => e.child(coordinatorBadge(t)))
        .when(c.role === "child", (e) => e.child(reviewChip(t, c)))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(c.where || c.folder)))
      .when(c.ownerName !== "", (e) => e.child(lentNote(t, c)))
      .when(task !== "", (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(task)))
      .child(div().min_w(0).truncate().text_size(11.5).text_color(c.question ? t.blocked : t.muted).child(line || "Nothing yet"));
  }

  feedSection(t) {
    // The coordinator reads "Coordinator": its tab name is whatever it happens to be working on.
    const labels = new Map(this.cards.map((c) => [c.name, c.role === "coordinator" ? "Coordinator" : c.label]));
    const who = (name) => labels.get(name) ?? name;
    const feed = messageFeed([...this.tails.values()]).map((m) => ({ ...m, to: resolveTarget(m.to, this.sessions) }));
    return messagesSection(t, { ...this.messages, feed, chatty: chattyPairs(feed, Date.now()), who }, {
      onToggle: (_e, cx) => { this.messages.open = !this.messages.open; cx.notify(); },
      onExpand: (key, cx) => { const s = this.messages.expanded; if (!s.delete(key)) s.add(key); cx.notify(); },
    });
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
      .child(knowledgeSection(t, this.knowledge, {
        onToggle: (_e, cx) => { this.knowledge.open = !this.knowledge.open; cx.notify(); },
        onZed: (_e, cx) => this.openKnowledge(cx),
      }))
      .child(v_flex().id("team-list").flex_1().min_h(0).overflow_y_scroll().p(8).gap(7)
        .children(this.cards.map((c) => this.card(t, c)))
        .child(this.feedSection(t)));
  }
}
