// Claude's 5-hour and 7-day limits: how much is left and when each resets. Accounts that report no limits
// get an estimated spend view instead. The Claude Code status line (claude/statusline.sh) writes
// ~/.cache/claude/usage.json and one ~/.cache/claude/cost/<session>.json per session on every refresh.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, readTextFile, home, theme, layout } from "herdr";
import { dollars, parseCost, pickView, spendTotals } from "./spend.js";

const STALE_MS = 15 * 60000;
const LIST_COSTS = 'ls "$HOME"/.cache/claude/cost/*.json 2>/dev/null';
const SPEND_ROWS = [["today", "Today"], ["week", "Last 7 days"], ["month", "This month"]];
const WINDOWS = [["five_hour", "Current session"], ["seven_day", "This week"]];

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function duration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clock(ms) {
  const d = new Date(ms), now = new Date();
  const h = d.getHours() % 12 || 12, m = d.getMinutes();
  const time = `${h}:${String(m).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`;
  return d.toDateString() === now.toDateString() ? `at ${time}` : `${DAYS[d.getDay()]} ${time}`;
}

export default class ClaudeUsage extends View {
  init(_props, cx) {
    this.data = null;
    /** @type {import("./spend.js").CostEntry[]} */
    this.costs = [];
    this.load(cx);
    cx.timer.every(15000, (cx) => this.load(cx));
  }

  load(cx) {
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${home()}/.cache/claude/usage.json`).catch(() => null);
      try { this.data = text ? JSON.parse(text) : null; } catch { this.data = null; }
      if (pickView(this.data) === "spend") await this.loadCosts();
      cx.notify();
    });
  }

  async loadCosts() {
    const files = (await exec("sh", ["-c", LIST_COSTS]).catch(() => ({ stdout: "" }))).stdout.split("\n").filter(Boolean);
    const texts = await Promise.all(files.map((file) => readTextFile(file).catch(() => null)));
    this.costs = texts.map((text) => (text ? parseCost(text) : null)).filter(Boolean);
  }

  spendRow(t, name, amount) {
    return h_flex().items_center().text_size(12)
      .child(div().text_color(t.foreground).child(name))
      .child(div().flex_1())
      .child(div().text_color(t.muted).child(dollars(amount)));
  }

  spendRows(t, now) {
    const totals = spendTotals(this.costs, now);
    return [
      ...SPEND_ROWS.map(([key, name]) => this.spendRow(t, name, totals[key])),
      div().text_size(11).text_color(t.dim).child("Estimated from API list prices; your plan may bill differently."),
    ];
  }

  row(t, key, name, now) {
    const w = this.data?.rate_limits?.[key];
    const resetAt = Number(w?.resets_at) * 1000;
    const reset = Number.isFinite(resetAt) && resetAt <= now;
    const used = reset ? 0 : Math.max(0, Math.min(100, Number(w?.used_percentage) || 0));
    const tone = used >= 90 ? t.blocked : used >= 70 ? t.working : t.accent;
    const when = !w ? "No reading yet" : reset ? "Has reset" : `Resets ${clock(resetAt)} · in ${duration(resetAt - now)}`;
    return v_flex().gap(4)
      .child(h_flex().items_center().text_size(12)
        .child(div().text_color(t.foreground).child(name))
        .child(div().flex_1())
        .child(div().text_color(t.muted).child(w ? `${Math.round(used)}% used` : "-")))
      .child(div().h(5).w_full().rounded(3).bg(t.raised)
        .child(div().h_full().rounded(3).bg(tone).w(`${w ? used : 0}%`)))
      .child(div().text_size(11).text_color(t.dim).truncate().child(when));
  }

  render() {
    const t = theme();
    if (narrow()) return div();
    const now = Date.now();
    const at = Number(this.data?.at) * 1000;
    const stale = Number.isFinite(at) && now - at > STALE_MS;
    const spend = pickView(this.data) === "spend";
    return v_flex().size_full().min_h(0).px(16).pt(10).pb(10).gap(10).bg(t.chrome).border_t(1).border_color(t.border)
      .child(h_flex().items_center().text_size(11.5).text_color(t.dim)
        .child(div().font_medium().child(spend ? "Claude spend (estimated)" : "Claude usage"))
        .child(div().flex_1())
        .when(stale, (el) => el.child(div().text_size(11).child(`updated ${duration(now - at)} ago`))))
      .children(spend ? this.spendRows(t, now) : WINDOWS.map(([key, name]) => this.row(t, key, name, now)));
  }
}
