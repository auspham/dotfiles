// Team: the agents that share this herdr space, what each is doing, their messages to each other,
// and a box to guide one of them.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { checking, exec, focused, hc, readTextFile, run, terminals, theme } from "herdr";
import { chattyPairs, messageFeed, readTail } from "./feed.js";
import { parseSessions, spaceName, teamCards } from "./roster.js";

const REFRESH_MS = 3000;
const TAIL_LINES = 150;
const MAX_AGENTS = 8;
const NOTE_MS = 5000;

const LIST_SESSIONS = 'ls "$HOME"/.claude/sessions/*.json 2>/dev/null';
const FIND_TRANSCRIPT = 'ls "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -1';

export default class Team extends View {
  init(_props, cx) {
    this.sessions = new Map(); this.tails = new Map(); this.paths = new Map();
    this.cards = []; this.target = null; this.note = ""; this.noteAt = 0; this.loading = false;
    this.draft = InputState.new({ placeholder: "Message the selected agent" });
    this.draft.on("submit", (_e, cx) => this.send(cx));
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
  }

  // Reads the live session registry (names, never the credential files beside it) and each agent's transcript tail.
  refresh(cx) {
    if (this.note && Date.now() - this.noteAt > NOTE_MS) { this.note = ""; cx.notify(); }
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        await this.loadSessions();
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

  // Guiding an agent is you typing to it, so it goes through hc send, like typing in its terminal.
  send(cx) {
    const text = this.draft.value().trim();
    const card = this.cards.find((c) => c.address === this.target);
    if (!text) return;
    if (!card) return this.tell("Pick an agent first.", cx);
    this.draft.set_value("");
    cx.spawn(async (cx) => {
      const result = await hc(["send", card.address, text]).catch(() => ({ code: 1 }));
      this.tell(result.code === 0 ? `Sent to ${card.name}.` : `Could not send to ${card.name}.`, cx);
    });
  }

  // The note fades on a later refresh, so no timer of its own is needed.
  tell(note, cx) {
    this.note = note; this.noteAt = Date.now();
    cx.notify();
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
    return v_flex().id(`team-${c.address}`).gap(3).p(9).rounded(8).bg(t.raised).cursor_pointer()
      .hover((h) => h.bg(t.hover))
      .on_click(() => run("agent.focus", { terminal: c.address }))
      .child(h_flex().gap(8).items_center()
        .child(this.statusMark(t, c.status))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(c.name))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(c.where || c.folder)))
      .child(div().min_w(0).truncate().text_size(11.5).text_color(c.question ? t.blocked : t.muted).child(line || "Nothing yet"));
  }

  feedRows(t, feed) {
    if (!feed.length) return [div().text_size(11.5).text_color(t.dim).child("No messages yet. Agents message each other with SendMessage.")];
    return feed.map((m, i) => h_flex().id(`msg-${i}`).gap(6).text_size(11.5).items_start()
      .child(div().flex_none().font_semibold().text_color(t.foreground).child(`${m.from} → ${m.to}`))
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

  chip(t, c) {
    const on = c.address === this.target;
    return div().id(`to-${c.address}`).h(24).px(9).flex().items_center().rounded(6).text_size(11.5).cursor_pointer()
      .bg(on ? t.solid : t.raised).text_color(on ? t.solid_foreground : t.muted)
      .on_click((_e, cx) => { this.target = c.address; cx.notify(); }).child(c.name);
  }

  composer(t) {
    return v_flex().flex_none().p(10).gap(7).border_t(1).border_color(t.border)
      .child(h_flex().gap(5).flex_wrap().children(this.cards.map((c) => this.chip(t, c))))
      .child(h_flex().gap(8)
        .child(div().id("team-box").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(t.border).cursor_text()
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(Input.new(this.draft).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("team-send").h(32).px(14).flex().items_center().rounded(8).text_size(12).cursor_pointer()
          .bg(t.solid).text_color(t.solid_foreground).on_click((_e, cx) => this.send(cx)).child("Send")))
      .when(Boolean(this.note), (e) => e.child(div().text_size(11).text_color(t.dim).child(this.note)));
  }

  render() {
    const t = theme();
    const all = terminals();
    const spaceId = focused()?.space;
    this.cards = teamCards({ terminals: all, sessions: this.sessions, spaceId });
    if (!this.cards.some((c) => c.address === this.target)) this.target = this.cards[0]?.address ?? null;
    const heading = `${spaceName(all, spaceId) || "This space"} · ${this.cards.length} agent${this.cards.length === 1 ? "" : "s"}`;
    return v_flex().size_full().text_size(12)
      .child(div().flex_none().h(36).px(12).flex().items_center().border_b(1).border_color(t.border).font_semibold().text_color(t.foreground).child(heading))
      .child(v_flex().id("team-list").flex_1().min_h(0).overflow_y_scroll().p(8).gap(7)
        .children(this.cards.map((c) => this.card(t, c)))
        .child(this.feedSection(t)))
      .child(this.composer(t));
  }
}
