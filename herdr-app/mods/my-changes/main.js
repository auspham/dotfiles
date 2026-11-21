import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list, TextView, ScrollHandle } from "gpui-base";
import { spaces, panes, focused, terminals, exec, readTextFile, watchFolder, theme, settings, nextCommand, layout, run, shared, setShared, home, openOverlay, closeOverlay, props } from "herdr";
import { langFor, highlightRows, hashLines, wrapTokens } from "./highlight.js";

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const MAX_ROWS = 5000;
const BASES = ["origin/HEAD", "main", "master", "origin/main", "origin/master", "develop"];
const TONES = { keyword: "ansi5", string: "ansi2", comment: "dim", number: "ansi3", constant: "ansi3", function: "ansi4", type: "ansi6", property: "ansi4" };
const tone = (t, c) => (c ? t[TONES[c]] : null) ?? t.foreground;
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Text draws a tab as nothing: pad each to the next 4-column stop.
const untab = (text) => text.replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: untab(line.slice(1)) || " " };
    if (kind === "+") return { kind, number: next++, text: untab(line.slice(1)) || " " };
    if (kind === " ") return { kind, old: old++, number: next++, text: untab(line.slice(1)) || " " };
    return { kind: "", text: line };
  });
}

// Split view: a run of removed lines sits beside the run of added lines that follows it; context shows on both sides.
function pairRows(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind === "-") {
      const removed = [], added = [];
      while (rows[i]?.kind === "-") removed.push(rows[i++]);
      while (rows[i]?.kind === "+") added.push(rows[i++]);
      for (let k = 0; k < Math.max(removed.length, added.length); k++) out.push({ kind: "pair", left: removed[k] ?? null, right: added[k] ?? null });
    } else if (row.kind === "+") { out.push({ kind: "pair", left: null, right: row }); i++; }
    else if (row.kind === " ") { out.push({ kind: "pair", left: { ...row, number: row.old }, right: row }); i++; }
    else { out.push(row); i++; }
  }
  return out;
}

const findNode = (node, id) => {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const hit = findNode(child, id); if (hit) return hit; }
  return null;
};
const EXPANDED_PX = 960;
const CHAR = 6.7, NUMBER_W = 30, GAP = 10, EDGE = 10, LINE_H = 20;
const FENCE = "`".repeat(3);
const MODELS = [["default", "Default"], ["fable", "Fable"], ["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"]];
const EFFORTS = [["default", "Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "XHigh"], ["max", "Max"]];
const ASK_TOOLS = "Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(git status:*),Bash(git blame:*),Bash(git branch:*)";
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export default class Changes extends View {
  init(_props, cx) {
    if (props()?.menu) return;
    this.files = []; this.rows = []; this.diffWidth = 0; this.handle = cx.focus_handle(); this.hadFocus = false;
    cx.timer.every(200, (cx) => { const on = this.holds(); if (on !== this.hadFocus) { this.hadFocus = on; cx.notify(); } });
    this.range = this.read("range") === "branch" ? "branch" : "work"; this.mode = this.read("mode") === "split" ? "split" : "unified"; this.split = []; this.half = 300; this.ratio = clamp(Number(this.read("ratio")) || 0.5, 0.15, 0.85); this.diffW = 800; this.splitVersion = 0; this.drag = false; this.heights = []; this.marks = {}; this.base = null;
    this.question = InputState.new({ placeholder: "Ask about this change" });
    this.question.on("change", (_e, cx) => { const has = Boolean(this.question.value().trim()); if (has !== this.hasQuestion) { this.hasQuestion = has; cx.notify(); } });
    this.question.on("submit", (_e, cx) => this.ask("inline", cx));
    this.question.on("focus", (_e, cx) => { this.asking = true; cx.notify(); });
    this.question.on("blur", (_e, cx) => { this.asking = false; cx.notify(); });
    this.sel = null; this.chat = { session: null, messages: [] }; this.hasQuestion = false; this.threadScroll = ScrollHandle.new(); this.scrollThreads = false; this.threadH = clamp(Number(this.read("threadH")) || 240, 90, 900); this.areaH = 700; this.vdrag = null;
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
    cx.timer.every(400, (cx) => this.applyFocus(cx));
    cx.spawn(async (cx) => { for (;;) { this.command(await nextCommand(), cx); cx.notify(); } });
  }

  // `herdr-app do my-changes.<command>`, and what a key binding can send: range:work, range:branch, next, prev, mark, open:<path>
  command(name, cx) {
    const [verb, arg] = [name.split(":")[0], name.includes(":") ? name.slice(name.indexOf(":") + 1) : ""];
    const at = this.files.findIndex((f) => f.path === this.open);
    if (verb === "range") this.setRange(arg === "branch" ? "branch" : "work", cx);
    else if (verb === "mode") this.setMode(arg === "split" ? "split" : "unified", cx);
    else if (verb === "expand") this.toggleExpand();
    else if (verb === "click" || verb === "shiftclick") this.pickRow(`${this.mode}${arg}`, verb === "shiftclick", cx);
    else if (verb === "threadh") { this.threadH = clamp(Number(arg) || 240, 90, 900); this.write("threadH", String(this.threadH)); }
    else if (verb === "focus" && !arg) { this.handle.focus(); setShared("nav.focus", "changes"); }
    else if (verb === "focus") setShared("review.focus", { root: this.root, path: arg, space: spaces().find((sp) => sp.active)?.id, ts: Date.now() });
    else if (verb === "model" && MODELS.some(([id]) => id === arg)) setShared("review.askModel", arg);
    else if (verb === "effort" && EFFORTS.some(([id]) => id === arg)) setShared("review.askEffort", arg);
    else if (verb === "menu") { const [kind, x, y] = arg.split(":"); this.openMenu(kind === "effort" ? "effort" : "model", x && y ? { x: Number(x), y: Number(y) } : null); }
    else if (verb === "forget") { this.chat = { session: null, messages: [] }; this.saveChat(); }
    else if (verb === "select") { const [a, b] = arg.split("-").map(Number); if (Number.isInteger(a)) this.sel = { from: a, to: Number.isInteger(b) ? b : a }; }
    else if (verb === "ask") { const [kind, ...rest] = arg.split(":"); this.question.set_value(rest.join(":")); this.ask(kind, cx); }
    else if (verb === "ratio") { this.ratio = clamp(Number(arg) || 0.5, 0.15, 0.85); this.write("ratio", String(this.ratio)); }
    else if (verb === "next" || verb === "prev") {
      const target = this.files[at + (verb === "next" ? 1 : -1)];
      if (target) this.pick(target.path, cx, true);
    } else if (verb === "mark" && this.open) this.toggleReviewed(this.open, cx, true);
    else if (verb === "open" && arg) this.pick(arg, cx, true);
  }

  read(name) { try { return localStorage.getItem(name); } catch { return null; } }
  write(name, value) { try { localStorage.setItem(name, value); } catch { /* storage can be unavailable */ } }

  // The branch this one forked from: the first of the usual names that exists and is not HEAD itself.
  async findBase(git) {
    if (this.baseAt && Date.now() - this.baseAt < 30000 && this.baseRoot === this.root) return this.base;
    let found = null;
    for (const ref of BASES) {
      const ok = await git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      if (ok.code !== 0) continue;
      const mb = await git(["merge-base", "HEAD", ref]);
      if (mb.code === 0 && mb.stdout.trim()) { found = { name: ref.replace(/^origin\//, ""), rev: mb.stdout.trim() }; break; }
    }
    this.base = found; this.baseAt = Date.now(); this.baseRoot = this.root;
    return found;
  }

  marksKey() { return `reviewed:${this.root}:${this.range === "branch" ? this.against : "work"}`; }
  loadMarks() { try { this.marks = JSON.parse(this.read(this.marksKey()) ?? "{}") || {}; } catch { this.marks = {}; } }
  saveMarks() { this.write(this.marksKey(), JSON.stringify(this.marks)); }
  sig(f) { return `${f.status}:${f.add}:${f.del}`; }
  reviewed(f) { return this.marks[f.path]?.sig === this.sig(f) && !f.changedSince; }
  stale(f) { return Boolean(this.marks[f.path]) && !this.reviewed(f); }

  toggleReviewed(path, cx, advance = false) {
    const file = this.files.find((f) => f.path === path);
    if (!file) return;
    if (this.reviewed(file)) delete this.marks[path];
    else {
      this.marks[path] = { sig: this.sig(file), hash: file.hash ?? null };
      file.changedSince = false;
      if (advance) {
        const next = this.files.find((f) => f.path !== path && !this.reviewed(f));
        if (next) this.pick(next.path, cx, true);
      }
    }
    this.saveMarks(); cx.notify();
  }

  lastKey() { return `last:${this.root}`; }
  rememberLast() { if (this.root && this.open) { this.lastPath = this.open; this.write(this.lastKey(), JSON.stringify({ path: this.open, range: this.range })); } }

  // Which file to open when a folder's panel loads: one just asked for from the Agents list, else the one left open last time, else the first.
  initialFile(files) {
    const want = shared("review.focus");
    if (want && want.root === this.root && want.ts !== this.focusSeen && Date.now() - want.ts < 15000 && files.some((f) => f.path === want.path)) { this.focusSeen = want.ts; return want.path; }
    if (this.lastPath && files.some((f) => f.path === this.lastPath)) return this.lastPath;
    return files[0]?.path ?? null;
  }

  // A request from the Agents list to show one file's conversation: bring up this panel, then open the file.
  applyFocus(cx) {
    const want = shared("review.focus");
    if (!want || want.ts === this.focusSeen) return;
    if (Date.now() - want.ts > 15000) { this.focusSeen = want.ts; return; }
    const space = spaces().find((sp) => sp.active);
    if (want.space && space?.id !== want.space) return;
    const panel = findNode(layout(), "panel"), body = findNode(layout(), "panel-body");
    if (panel?.hidden || body?.active !== "changes") { run("layout.select", { stack: "panel-body", child: "changes" }); run("layout.show", { id: "panel" }); return; }
    if (key() !== this.context || !this.root) { this.refresh(cx); return; }
    if (want.root && this.root !== want.root) { this.focusSeen = want.ts; return; }
    if (want.path && !this.files.some((f) => f.path === want.path)) return;
    this.focusSeen = want.ts;
    this.scrollThreads = true;
    if (want.path) this.pick(want.path, cx, true);
    cx.notify();
  }

  setMode(mode, cx) { this.sel = null; this.mode = mode; this.write("mode", mode); cx?.notify(); }

  // Split view wants width: widen the panel, and put it back to how it was.
  toggleExpand() {
    const px = findNode(layout(), "panel")?.size?.px;
    if (px === undefined) return;
    if (px < EXPANDED_PX - 8) { this.restorePx = px; run("layout.resize", { id: "panel", px: EXPANDED_PX }); }
    else run("layout.resize", { id: "panel", px: this.restorePx ?? 368 });
  }

  chatKey() { return `ask:${this.root}`; }
  loadChat() {
    let chat = null;
    try { chat = JSON.parse(this.read(this.chatKey()) ?? "null"); } catch { chat = null; }
    if (!chat) {
      let old = {};
      try { old = JSON.parse(this.read(`threads:${this.root}`) ?? "{}") || {}; } catch { old = {}; }
      const messages = Object.entries(old).flatMap(([path, list]) => list.map((th) => ({ id: th.id, path, label: th.label, q: th.q, a: th.a, status: th.status, at: th.at })));
      chat = { session: null, messages: messages.sort((x, y) => x.at - y.at) };
    }
    chat.messages ??= [];
    for (const m of chat.messages) if (m.status === "pending") { m.status = "error"; m.a = "Interrupted: the panel reloaded before the answer arrived."; }
    this.chat = chat;
  }
  saveChat() { this.write(this.chatKey(), JSON.stringify(this.chat)); }

  // The space this folder belongs to: the one with the deepest folder that contains it.
  spaceId() {
    const within = (sp) => Boolean(sp.folder) && Boolean(this.root) && (this.root === sp.folder || this.root.startsWith(`${sp.folder}/`));
    return spaces().filter(within).sort((x, y) => y.folder.length - x.folder.length)[0]?.id ?? spaces().find((sp) => sp.active)?.id ?? null;
  }

  removeMessage(m, cx) {
    this.chat.messages = this.chat.messages.filter((x) => x.id !== m.id);
    this.saveChat(); cx.notify();
  }

  newChat(cx) {
    this.chat = { session: null, messages: [] };
    this.saveChat(); cx.notify();
  }

  rowsNow() { return this.mode === "split" ? this.split : this.rows; }
  isSel(i) { return Boolean(this.sel) && i >= Math.min(this.sel.from, this.sel.to) && i <= Math.max(this.sel.from, this.sel.to); }

  // Click picks a line, Shift-click extends from it, and clicking the only picked line again drops it.
  pickRow(key, extend, cx) {
    const index = Number(/(\d+)$/.exec(key)?.[1] ?? -1), row = this.rowsNow()[index];
    if (!row || row.kind === "@" || row.kind === "") return;
    if (extend && this.sel) this.sel = { from: this.sel.from, to: index };
    else if (!extend && this.sel && this.sel.from === index && this.sel.to === index) this.sel = null;
    else this.sel = { from: index, to: index };
    cx.notify();
  }

  // The selected diff lines as text, with the numbers a reader would quote; the whole file when nothing is picked.
  snippet() {
    const rows = this.rowsNow();
    const a = this.sel ? Math.min(this.sel.from, this.sel.to) : 0, b = this.sel ? Math.max(this.sel.from, this.sel.to) : rows.length - 1;
    const lines = [], fresh = [], gone = [];
    const emit = (prefix, r, number) => {
      lines.push(`${prefix} ${String(number ?? "").padStart(4)} | ${r.text}`);
      if (number !== undefined) (prefix === "-" ? gone : fresh).push(number);
    };
    for (let i = a; i <= b && lines.length < 400; i++) {
      const row = rows[i];
      if (!row) continue;
      if (row.kind === "@") lines.push(row.text);
      else if (row.kind === "pair") {
        if (row.left?.kind === "-") emit("-", row.left, row.left.number);
        if (row.right?.kind === "+") emit("+", row.right, row.right.number);
        if (row.left?.kind === " ") emit(" ", row.right, row.right.number);
      } else if (row.kind === "+" || row.kind === "-" || row.kind === " ") emit(row.kind, row, row.number);
    }
    const span = (n) => (n.length ? (Math.min(...n) === Math.max(...n) ? `${Math.min(...n)}` : `${Math.min(...n)}-${Math.max(...n)}`) : "");
    const label = !this.sel ? "the whole file diff" : fresh.length ? `line${span(fresh).includes("-") ? "s" : ""} ${span(fresh)}` : `removed line${span(gone).includes("-") ? "s" : ""} ${span(gone)}`;
    return { label, text: lines.join("\n") };
  }

  // The live agents in this space, with where each one's conversation log is, so the Ask can read what they did and why.
  async preamble() {
    const space = this.spaceId();
    const mine = terminals().filter((t) => t.state === "live" && t.status && t.labels?.["herdr.space"] === space);
    const lines = [];
    for (const t of mine) {
      const id = t.labels?.["claude.session"];
      const log = id ? (await exec("sh", ["-c", 'ls "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -1', "sh", id]).then((r) => r.stdout.trim()).catch(() => "")) : "";
      lines.push(`- ${t.address} "${t.title || "agent"}" (${t.status?.state ?? "unknown"}), working in ${t.foreground?.cwd ?? t.cwd}${log ? `, its conversation log: ${log}` : ""}`);
    }
    return `You are the read-only review assistant for the project at ${this.root}. The user is reviewing code that coding agents wrote and asks you about it. Answer by reading the code and, when asked why something was done, the agents' own conversation logs listed below (JSONL files). Use git only to read: diff, log, show, status, blame. Never edit files and never run anything else. Be concise and point at file and line.\n\nAgents in this space right now:\n${lines.join("\n") || "- none"}`;
  }

  compose(question, snippet) {
    if (!snippet || !this.open) return question;
    const where = this.range === "branch" && this.base ? `everything since ${this.base.name}` : "the uncommitted changes";
    return `About ${this.open} (${where}), ${snippet.label}:\n\n${FENCE}diff\n${snippet.text}\n${FENCE}\n\n${question}`;
  }

  ask(_kind, cx) {
    const question = this.question.value().trim();
    if (!question || !this.root || this.chat.messages.some((m) => m.status === "pending")) return;
    const snippet = this.open ? this.snippet() : null;
    const message = { id: Date.now().toString(36), path: this.open ?? null, label: snippet?.label ?? "", q: question, a: "", status: "pending", at: Date.now() };
    this.chat.messages.push(message);
    this.scrollThreads = true;
    this.question.set_value(""); this.hasQuestion = false; this.sel = null;
    const root = this.root, on = this.on, prompt = this.compose(question, snippet), model = this.modelId, effort = this.effortId;
    this.saveChat(); cx.notify();
    cx.spawn(async (cx) => {
      try {
        const system = await this.preamble();
        const send = (session) => exec("claude", ["-p", "--output-format", "json", "--allowedTools", ASK_TOOLS, "--add-dir", `${home()}/.claude/projects`, "--append-system-prompt", system, ...(model !== "default" ? ["--model", model] : []), ...(effort !== "default" ? ["--effort", effort] : []), ...(session ? ["--resume", session] : []), "--", prompt], { cwd: root, on, timeout: 600000 });
        let r = await send(this.chat.session);
        if (r.code !== 0 && this.chat.session) { this.chat.session = null; r = await send(null); }
        if (!r.stdout.trim()) throw new Error(r.stderr.trim() || "No answer came back.");
        const out = JSON.parse(r.stdout);
        if (r.code !== 0 || out.is_error) throw new Error(String(out.result || r.stderr || "The question failed."));
        this.chat.session = out.session_id ?? this.chat.session;
        message.a = String(out.result ?? "").trim() || "No answer came back.";
        message.status = "done";
      } catch (e) { message.status = "error"; message.a = String(e.message ?? e); }
      this.scrollThreads = true; this.saveChat(); cx.notify();
    });
  }

  // One exchange, read like a chat: the question is a right-aligned bubble, the answer sits under the assistant's name beside a rail.
  threadCard(m, t, last) {
    const answer = m.status === "pending"
      ? h_flex().gap(7).items_center().text_size(12).text_color(t.working).child(svg("mods/workspace-chrome/spinner.svg").size(13).flex_none().text_color(t.working).spin(900)).child("Reading the code…")
      : m.status === "error"
        ? div().text_size(12).text_color(t.blocked).child(m.a)
        : div().text_size(12.5).text_color(t.foreground).child(TextView.markdown(`answer-${m.id}`, m.a).selectable(true));
    const about = m.path ? `You asked about ${m.path.split("/").pop()}${m.label ? ` · ${m.label}` : ""}` : "You asked";
    return v_flex().gap(10).pb(12)
      .when(!last, (e) => e.border_b(1).border_color(t.border))
      .child(h_flex().gap(8).items_center().text_size(11).text_color(t.dim)
        .child(div().min_w(0).truncate().child(about))
        .child(div().flex_1())
        .child(div().id(`thread-del-${m.id}`).px(6).h(18).flex().items_center().rounded(4).cursor_pointer().tooltip("Delete this exchange").hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.removeMessage(m, cx)).child("×")))
      .child(v_flex().w_full().min_w(0).items_end().pl(36)
        .child(div().max_w_full().min_w(0).px(12).py(8).rounded(12).bg(t.accent + "26").border_1().border_color(t.accent + "66").text_size(12.5).font_semibold().text_color(t.foreground).child(m.q)))
      .child(v_flex().gap(5)
        .child(h_flex().gap(6).items_center().min_w(0).overflow_hidden().text_size(11)
          .child(div().flex_none().font_semibold().text_color(t.ansi5).child("Claude"))
          .child(div().min_w(0).truncate().text_color(t.dim).child("· read-only, reads the code and the agents' logs")))
        .child(div().pl(12).pr(4).border_l(2).border_color(t.ansi5 + "88").child(answer)));
  }

  askPanel(t) {
    const messages = this.chat.messages, snippet = this.snippet();
    const busy = messages.some((m) => m.status === "pending");
    if (this.scrollThreads && messages.length) { this.scrollThreads = false; this.threadScroll.scroll_to_item(messages.length - 1); }
    const small = (id, label, tip, click) => div().id(id).px(7).h(20).flex().items_center().rounded(5).bg(t.raised).text_size(11).text_color(t.muted)
      .cursor_pointer().hover((h) => h.bg(t.hover).text_color(t.foreground)).on_click(click).tooltip(tip).child(label);
    const chip = (id, label, tip, kind) => div().id(id).px(7).h(20).flex().items_center().rounded(5).bg(t.raised).text_size(11).text_color(t.muted)
      .cursor_pointer().hover((h) => h.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", (ev, cx) => { cx.stop_propagation(); this.openMenu(kind, ev.position); }).tooltip(tip).child(label);
    const ready = this.hasQuestion && !busy;
    return v_flex().flex_none()
      .when(messages.length === 0, (e) => e.border_t(1).border_color(t.border))
      .when(messages.length > 0, (e) => e.child(div().id("threads-handle").w_full().h(7).flex_none().flex().items_center().cursor_row_resize()
        .hover((h) => h.bg(t.hover))
        .on_mouse_down("left", (ev, cx) => {
          cx.stop_propagation();
          if (ev.click_count === 2) { this.threadH = 240; this.write("threadH", "240"); }
          else this.vdrag = { y: ev.position.y, h: this.threadH };
          cx.notify();
        })
        .child(div().w_full().h(1).bg(t.border))))
      .when(messages.length > 0, (e) => e.child(v_flex().id("threads").h(Math.min(this.threadH, Math.max(90, this.areaH - 140))).overflow_y_scroll().track_scroll(this.threadScroll).p(12).gap(12).border_b(1).border_color(t.border).children(messages.map((m, i) => this.threadCard(m, t, i === messages.length - 1)))))
      .child(v_flex().p(10).gap(7)
        .child(h_flex().gap(6).items_center().flex_wrap().text_size(11).text_color(t.muted)
          .child(div().flex_1().min_w(120).truncate().child(this.sel ? `Asking about ${snippet.label} · Shift-click extends, Esc clears` : this.open ? "Asking about this file. Click a line to ask about it, Shift-click to extend." : "Ask anything about this space."))
          .child(chip("ask-model", `Model: ${MODELS.find(([id]) => id === this.modelId)?.[1] ?? "Default"} \u25be`, "Choose the model for your next question", "model"))
          .child(chip("ask-effort", `Effort: ${EFFORTS.find(([id]) => id === this.effortId)?.[1] ?? "Default"} \u25be`, "Choose the effort for your next question", "effort"))
          .when(Boolean(this.sel), (e) => e.child(small("ask-clear", "Clear", "Ask about the whole file instead", (_e, cx) => { this.sel = null; cx.notify(); })))
          .when(messages.length > 0, (e) => e.child(small("ask-new", "New chat", "Start over: the assistant forgets this conversation", (_e, cx) => this.newChat(cx)))))
        .child(h_flex().gap(8)
          .child(div().id("ask-box").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(this.asking ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.question).h_full().text_size(12).text_color(t.foreground)))
          .child(div().id("ask-inline").h(32).px(14).flex().items_center().rounded(8).text_size(12).tooltip("One read-only conversation for this space: it reads the code and the agents' logs")
            .bg(ready ? t.solid : t.raised).text_color(ready ? t.solid_foreground : t.dim)
            .when(ready, (e) => e.cursor_pointer()).on_click((_e, cx) => { if (ready) this.ask("inline", cx); }).child(busy ? "Thinking…" : "Ask"))));
  }

  setRange(range, cx) {
    if (this.range === range) return;
    this.range = range; this.write("range", range);
    if (this.root && this.lastPath) this.write(this.lastKey(), JSON.stringify({ path: this.lastPath, range }));
    this.files = []; this.open = null; this.closed = false; this.setLines([]);
    this.refresh(cx);
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) { this.pending = true; return; }
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        this.root = root;
        if (this.restoredFor !== root) {
          this.restoredFor = root;
          try { const last = JSON.parse(this.read(this.lastKey()) ?? "null"); if (last?.range === "branch" || last?.range === "work") this.range = last.range; this.lastPath = last?.path ?? null; } catch { this.lastPath = null; }
        }
        const base = head.code === 0 ? await this.findBase(git) : null;
        const against = this.range === "branch" && base ? base.rev : "HEAD";
        this.against = against;
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", against, "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        if (head.code === 0 && against !== "HEAD") {
          const names = (await git(["diff", against, "--name-status", "-z", "--no-renames"])).stdout.split("\0").filter(Boolean);
          for (let i = 0; i + 1 < names.length; i += 2) {
            const path = names[i + 1], letter = names[i][0];
            files.push({ path, status: letter === "D" ? "D" : letter === "A" ? "A" : letter === "U" ? "U" : "M", fresh: false, ...(stats[path] ?? { add: 0, del: 0 }) });
          }
          for (const entry of entries) if (entry.startsWith("??")) files.push({ path: entry.slice(3), status: "A", fresh: true, add: 0, del: 0 });
        } else {
          for (const entry of entries.slice(0, 1000)) {
            const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
            const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
            const st = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
            files.push({ path, status: st, fresh, ...(stats[path] ?? { add: 0, del: 0 }) });
          }
        }
        this.loadMarks();
        if (this.threadsRoot !== root) { this.threadsRoot = root; this.loadChat(); }
        if (key() !== context) return;
        this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) { this.open = this.initialFile(files); this.scrollThreads = true; this.rememberLast(); }
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); if (this.pending) { this.pending = false; this.refresh(cx); } }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, MAX_ROWS).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? [this.against ?? "HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) {
      const shown = lines.slice(0, MAX_ROWS).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line);
      this.truncated = lines.length > MAX_ROWS;
      this.setLines(shown, path);
      file.hash = hashLines(lines);
      const mark = this.marks[path];
      if (mark?.sig === this.sig(file) && mark.hash && mark.hash !== file.hash) file.changedSince = true;
    }
  }

  setLines(lines, path) {
    this.rows = diffRows(lines);
    const lang = path ? langFor(path) : null;
    if (lang) highlightRows(this.rows, lang);
    this.diffWidth = Math.max(300, ...this.rows.map(row => (row.text.length + 1) * 7 + 50));
    this.split = pairRows(this.rows);
    this.splitVersion++;
    this.half = Math.max(260, ...this.rows.filter((row) => row.kind !== "@").map((row) => (row.text.length + 1) * 7 + 56));
  }

  pick(path, cx, force = false) {
    this.sel = null;
    this.open = this.open === path && !force ? null : path;
    if (this.open) { this.scrollThreads = true; this.lastPath = this.open; this.write(this.lastKey(), JSON.stringify({ path: this.open, range: this.range })); } this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  // Wraps every split row to the width of its side; the rows' heights follow from how many lines each needs.
  layoutSplit() {
    const key = `${Math.round(this.diffW)}|${this.ratio.toFixed(3)}|${this.splitVersion}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const width = Math.max(200, this.diffW);
    this.leftW = Math.floor(width * this.ratio);
    this.rightW = Math.floor(width - this.leftW - 1);
    const cols = (w) => Math.max(12, Math.floor((w - NUMBER_W - GAP - EDGE) / CHAR));
    const leftCols = cols(this.leftW), rightCols = cols(this.rightW);
    const lines = (r, n) => (r ? wrapTokens(r.tokens ?? [{ s: r.text }], n) : null);
    this.heights = this.split.map((row) => {
      if (row.kind !== "pair") { row.n = 1; return LINE_H; }
      row.l = lines(row.left, leftCols); row.r = lines(row.right, rightCols);
      row.n = Math.max(row.l?.length ?? 1, row.r?.length ?? 1);
      return row.n * LINE_H;
    });
  }

  code(row, t) {
    return row.tokens
      ? h_flex().flex_1().min_w(0).overflow_hidden().whitespace_nowrap().children(row.tokens.map((k) => div().flex_none().text_color(tone(t, k.c)).child(k.s)))
      : div().flex_1().min_w(0).truncate().child(row.text);
  }

  diffRow(row, t, selected = false) {
    const { kind, number, text } = row;
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18")).when(selected, (e) => e.bg(t.accent + "33"))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(this.code(row, t));
  }

  splitRow(row, t, selected = false) {
    if (row.kind === "@") return div().w_full().px(12).h(LINE_H).flex_none().truncate().bg(t.raised).text_color(t.dim).child(row.text);
    if (row.kind !== "pair") return div().w_full().px(12).h(LINE_H).flex_none().truncate().text_color(t.dim).child(row.text);
    const side = (r, lines, width) => h_flex().w(width).flex_none().h(row.n * LINE_H).gap(GAP).overflow_hidden()
      .when(Boolean(r) && r.kind === "-", (e) => e.bg(t.ansi1 + "18")).when(Boolean(r) && r.kind === "+", (e) => e.bg(t.ansi2 + "18")).when(!r, (e) => e.bg(t.raised + "80")).when(selected && Boolean(r), (e) => e.bg(t.accent + "33"))
      .child(div().w(NUMBER_W).h(LINE_H).flex_none().text_right().text_color(t.dim).child(r?.number === undefined ? "" : String(r.number)))
      .child(lines
        ? v_flex().flex_1().min_w(0).children(lines.map((line) => h_flex().h(LINE_H).flex_none().whitespace_nowrap().children(line.map((k) => div().flex_none().text_color(tone(t, k.c)).child(k.s)))))
        : div().flex_1());
    return h_flex().w_full().h(row.n * LINE_H).flex_none().child(side(row.left, row.l, this.leftW)).child(div().w(1).h_full().flex_none().bg(t.border)).child(side(row.right, row.r, this.rightW));
  }

  // The model and effort dropdowns: a popup copy of this mod draws the list and writes the choice where the panel reads it.
  menuView(t) {
    const kind = props().menu, models = kind === "model", list = models ? MODELS : EFFORTS, key = models ? "review.askModel" : "review.askEffort";
    const current = shared(key) ?? "default";
    return v_flex().w_full().p(5).bg(t.popover).text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child(models ? "Model" : "Effort"))
      .children(list.map(([id, label]) => h_flex().id(`opt-${id}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground).cursor_pointer()
        .hover((h) => h.bg(t.hover))
        .on_click(() => { setShared(key, id); closeOverlay(props().overlay); })
        .child(div().flex_1().child(label))
        .when(id === current, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  get modelId() { return shared("review.askModel") ?? "default"; }
  get effortId() { return shared("review.askEffort") ?? "default"; }

  // Opens above the chip that was pressed, so a menu near the bottom of the window never runs off it.
  openMenu(kind, point) {
    const height = 44 + (kind === "model" ? MODELS.length : EFFORTS.length) * 31;
    const at = point ? { x: Math.max(8, point.x - 60), y: Math.max(8, point.y - height - 14) } : "pointer";
    openOverlay({ mod: "my-changes", kind: "popup", width: 190, height, at, props: { menu: kind } });
  }

  holds() { return this.handle.is_focused() && shared("nav.focus") === "changes"; }

  render(cx) {
    if (props()?.menu) return this.menuView(theme());
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const openFile = this.files.find((f) => f.path === this.open);
    const splitting = this.mode === "split";
    if (splitting) this.layoutSplit();
    const reviewedCount = this.files.filter((f) => this.reviewed(f)).length;
    const seg = (id, label, on, enabledSeg, click) => div().id(id).px(9).h(24).flex().items_center().rounded(6).text_size(12)
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : enabledSeg ? t.muted : t.dim)
      .when(enabledSeg, (e) => e.cursor_pointer().hover((h) => h.bg(on ? t.selected : t.hover))).on_click(enabledSeg ? click : () => {}).child(label);
    return v_flex().id("changes").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(this.holds() ? t.accent : t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        const step = { down: "next", j: "next", up: "prev", k: "prev" }[e.key];
        if (step && !this.typing && !this.asking && !e.modifiers.control && !e.modifiers.alt && !e.modifiers.shift) { this.command(step, cx); cx.stop_propagation(); cx.notify(); return; }
        if (e.key === "escape" && !this.typing && !this.asking && this.sel) { this.sel = null; cx.stop_propagation(); cx.notify(); return; }
        if (e.key === "escape" && (this.typing || this.asking)) { this.typing = false; this.asking = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Changes"))
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${this.files.length} files`))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`)))
      .child(h_flex().h(36).flex_none().px(10).gap(4).items_center().border_b(1).border_color(t.border)
        .child(seg("range-work", "Uncommitted", this.range === "work", true, (_e, cx) => this.setRange("work", cx)))
        .child(seg("range-branch", this.base ? `Since ${this.base.name}` : "Since base", this.range === "branch", Boolean(this.base), (_e, cx) => this.setRange("branch", cx)))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(this.files.length && reviewedCount === this.files.length ? t.ansi2 : t.muted).child(`${reviewedCount}/${this.files.length} reviewed`)))
      // overflow_y_scrollbar() wraps the list, so its flex sizing never reached the panel's layout.
      .child(div().flex_1().min_h(44).max_h(this.files.length * 28 + 12).relative().border_b(1).border_color(t.border)
        .child(v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().p(6).children(this.files.map((f) => {
        const parts = f.path.split("/"), name = parts.pop();
        return h_flex().id(`change-${f.path}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer().when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(f.path, cx))
          .child(div().id(`reviewed-${f.path}`).size(16).flex_none().rounded(4).border_1().border_color(this.reviewed(f) ? t.ansi2 : t.border)
            .when(this.reviewed(f), (e) => e.bg(t.ansi2 + "30")).flex().items_center().justify_center().cursor_pointer()
            .on_click((_e, cx) => { cx.stop_propagation(); this.toggleReviewed(f.path, cx); })
            .when(this.reviewed(f), (e) => e.child(svg("mods/workspace-chrome/check.svg").size(11).text_color(t.ansi2))))
          .child(div().w(14).text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
          .child(h_flex().flex_1().min_w(0).child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().max_w(260).min_w(0).truncate().text_color(this.reviewed(f) ? t.dim : t.foreground).child(name)))
          .when(this.chat.messages.some((m) => m.path === f.path), (e) => e.child(div().text_size(10).text_color(t.accent).child(`${this.chat.messages.filter((m) => m.path === f.path).length} Q`)))
          .when(this.stale(f), (e) => e.child(div().text_size(10).text_color(t.blocked).child("changed")))
          .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
      })).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder")))))
        .child(Scrollbar.vertical("changes-list").absolute().inset_0()))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .when(Boolean(openFile), (el) => el.child(h_flex().flex_none().h(36).px(12).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(this.open))
        .when(Boolean(openFile && this.stale(openFile)), (e) => e.child(div().text_size(11).text_color(t.blocked).child("changed since you reviewed")))
        .when(this.truncated, (e) => e.child(div().text_size(11).text_color(t.dim).child(`first ${MAX_ROWS.toLocaleString()} lines`)))
        .child(h_flex().gap(2).flex_none()
          .child(seg("mode-unified", "Unified", this.mode === "unified", true, (_e, cx) => this.setMode("unified", cx)))
          .child(seg("mode-split", "Split", this.mode === "split", true, (_e, cx) => this.setMode("split", cx)))
          .child(seg("expand", "\u2922", false, true, (_e, cx) => { this.toggleExpand(); cx.notify(); })))
        .child(div().id("mark-reviewed").h(26).px(10).flex().items_center().rounded(6).cursor_pointer().text_size(12)
          .bg(openFile && this.reviewed(openFile) ? t.raised : t.solid).text_color(openFile && this.reviewed(openFile) ? t.muted : t.solid_foreground)
          .on_click((_e, cx) => this.toggleReviewed(this.open, cx, true))
          .child(openFile && this.reviewed(openFile) ? "Reviewed (undo)" : "Mark reviewed"))))
      .child(v_flex().id("review-area").flex_1().min_h(0).relative()
        .on_size_change((size, cx) => { if (Math.abs(size.height - this.areaH) > 1) { this.areaH = size.height; cx.notify(); } })
        .on_mouse_down_out((_e, cx) => { if (this.sel) { this.sel = null; cx.notify(); } })
        .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .on_mouse_down("left", (ev) => { this.shift = Boolean(ev.modifiers?.shift); })
        .on_size_change((size, cx) => { if (Math.abs(size.width - this.diffW) > 1) { this.diffW = size.width; cx.notify(); } })
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(splitting ? 0 : this.diffWidth).h_full().child(v_virtual_list("changes-diff", splitting ? this.split.length : this.rows.length, splitting ? this.heights : LINE_H, (i) => `${this.mode}${i}`,
            (range) => splitting
              ? this.split.slice(range.start, range.end).map((row, k) => this.splitRow(row, t, this.isSel(range.start + k)))
              : this.rows.slice(range.start, range.end).map((row, k) => this.diffRow(row, t, this.isSel(range.start + k)))).size_full()
              .on_item_click((key, cx) => { const extend = this.shift; this.shift = false; this.pickRow(key, extend, cx); })
              .on_item_secondary_click((key, _ev, cx) => this.pickRow(key, true, cx)))))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(splitting && this.split.length > 0, (e) => e.child(div().id("split-handle").absolute().top(0).bottom(0).left((this.leftW ?? 0) - 3).w(7).cursor_col_resize()
          .on_mouse_down("left", (ev, cx) => {
            cx.stop_propagation();
            if (ev.click_count === 2) { this.ratio = 0.5; this.write("ratio", "0.5"); } else this.drag = true;
            cx.notify();
          })))
        .when(splitting && this.drag, (e) => e.child(div().id("split-drag").absolute().inset_0().cursor_col_resize()
          .on_mouse_move((ev, cx) => { this.ratio = clamp(ev.local_position.x / Math.max(1, this.diffW), 0.15, 0.85); cx.notify(); })
          .on_mouse_up("left", (_ev, cx) => { this.drag = false; this.write("ratio", String(this.ratio)); cx.notify(); })))
        .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Select a file to view its changes"))))
        .when(Boolean(this.open) && Boolean(this.root), (e) => e.child(this.askPanel(t)))
        .when(Boolean(this.vdrag), (e) => e.child(div().id("threads-drag").absolute().inset_0().cursor_row_resize()
          .on_mouse_move((ev, cx) => { this.threadH = clamp(this.vdrag.h + (this.vdrag.y - ev.position.y), 90, Math.max(90, this.areaH - 140)); cx.notify(); })
          .on_mouse_up("left", (_ev, cx) => { this.vdrag = null; this.write("threadH", String(Math.round(this.threadH))); cx.notify(); }))))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)));
  }
}
