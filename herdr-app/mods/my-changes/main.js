import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, TextareaState, Input, Scrollbar, v_virtual_list, TextView, ScrollHandle, VirtualListScrollHandle } from "gpui-base";
import { spaces, panes, focused, terminals, exec, readTextFile, watchFolder, theme, settings, nextCommand, layout, run, shared, setShared, home, openOverlay, closeOverlay, props } from "herdr";
import { langFor, highlightRows, hashLines, wrapTokens } from "./highlight.js";
import { coordinatorNote } from "./coordinator.js";
import { GuideSource } from "./guide_view.js";
import { guideBase } from "./guide.js";
import { childBase } from "./children.js";
import { LEVELS, LEVEL_LABEL, VERDICT_SCHEMA, pathFlags, diffFlags, isTest, isCode, testsChangedCode, levelOf, splitDiff, triagePrompt } from "./triage.js";
import { followFocus } from "./review_pane.js";
import { isReviewPane, followedTerminal, paneLocation, paneShown, openReviewPane, publishReview, publishThreads, paneThreads, paneList, requestToggle, takeToggle, takeJump } from "./review_link.js";
import { paneView, syncPane } from "./review_pane_view.js";
import { CommentStore } from "./comment_store.js";
import { sender, pollReplies, readReplies, askAgent } from "./comment_send.js";
import { pickTarget } from "./comment_prompt.js";
import { applyChatReplies, chatListening, settleChat } from "./ask_agent.js";
import { listening } from "./comment_replies.js";
import { commentLayout, blockView } from "./comment_view.js";
import { drawnPx } from "./comment_layout.js";
import { openComposer, closeComposer, clickBlock, submitComposer } from "./comment_actions.js";
import { composerBar } from "./comment_bar_view.js";
import { listShown } from "./comment_list.js";

let lastLocation = null;
function location() {
  if (isReviewPane()) return paneLocation();
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  lastLocation = followFocus(pane, { cwd: pane?.cwd || f?.cwd || space?.folder, on }, lastLocation);
  return lastLocation;
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const MAX_ROWS = 5000;
// Below this toolbar width the Open in Zed button shortens its label, so the buttons stay on one tidy row.
const COMPACT_BAR = 440;
const BASES = ["origin/HEAD", "main", "master", "origin/main", "origin/master", "develop"];
// What the diff is taken against: HEAD (work), HEAD's parent (commit), or where the branch forked (branch).
const RANGES = ["work", "commit", "branch"];
const asRange = (value) => (RANGES.includes(value) ? value : "work");
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
// A conversation started under an older role (read-only) keeps refusing to edit, so it starts over.
const ASK_ROLE = "edit-tests";
const ASK_TOOLS = "Read,Grep,Glob,Edit,MultiEdit,Write,Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(git status:*),Bash(git blame:*),Bash(git branch:*)";
// Runs the project's tests and records the result where the panel reads it; the chat may run only this.
const testScript = () => `${home()}/.config/herdr-app/mods/my-changes/run-tests.sh`;
// A run that never finished (its process was killed) stops counting as running after the script's own timeout.
const RUN_LIMIT_MS = 16 * 60000;
// Changed files as a folder tree: folders first, then files, by name; a folder holding only one folder
// shares its row ("src/app"), as editors draw it. Each node: { name, path, dirs, files }.
function fileTree(files) {
  const root = { name: "", path: "", dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    parts.pop();
    let node = root;
    for (const part of parts) {
      const path = node.path ? `${node.path}/${part}` : part;
      if (!node.dirs.has(part)) node.dirs.set(part, { name: part, path, dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push(f);
  }
  const compact = (node) => {
    for (const [key, dir] of node.dirs) {
      let d = dir;
      while (d.files.length === 0 && d.dirs.size === 1) {
        const only = [...d.dirs.values()][0];
        d = { ...only, name: `${d.name}/${only.name}` };
      }
      node.dirs.set(key, d);
      compact(d);
    }
    return node;
  };
  return compact(root);
}

// The tree as rows to draw, top to bottom; a folded folder hides what is inside it.
function treeRows(node, folded, depth = 0, out = []) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  for (const dir of [...node.dirs.values()].sort(byName)) {
    out.push({ kind: "dir", dir, depth });
    if (!folded.has(dir.path)) treeRows(dir, folded, depth + 1, out);
  }
  for (const f of [...node.files].sort((a, b) => a.path.localeCompare(b.path))) out.push({ kind: "file", f, depth });
  return out;
}

function treeFiles(node) {
  return treeRows(node, new Set()).filter((row) => row.kind === "file").map((row) => row.f);
}

const duration = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const VIEWS = ["tree", "list", "risk"];
const VIEW_LABEL = { tree: "Tree", list: "List", risk: "Risk" };
const ROW_H = { dir: 26, group: 36, note: 24, file: 28, risk: 46 };
const LEVEL_TONE = { high: "blocked", normal: "accent", skim: "muted" };
// Adds an alpha to a #rrggbb theme colour; any other form is left as it is.
const fade = (color, alpha) => (/^#[0-9a-f]{6}$/i.test(color) ? color + alpha : color);

export default class Changes extends View {
  init(_props, cx) {
    if (props()?.menu) return;
    this.files = []; this.rows = []; this.diffWidth = 0; this.handle = cx.focus_handle(); this.hadFocus = false;
    cx.timer.every(200, (cx) => { const on = this.holds(); if (on !== this.hadFocus) { this.hadFocus = on; cx.notify(); } });
    this.range = this.userRange = asRange(this.read("range")); this.mode = this.read("mode") === "split" ? "split" : "unified"; this.split = []; this.half = 300; this.ratio = clamp(Number(this.read("ratio")) || 0.5, 0.15, 0.85); this.diffW = 800; this.barW = 600; this.splitVersion = 0; this.drag = false; this.heights = []; this.marks = {}; this.base = null;
    this.question = InputState.new({ placeholder: "Ask about this change, or ask for a fix" });
    this.question.on("change", (_e, cx) => { const has = Boolean(this.question.value().trim()); if (has !== this.hasQuestion) { this.hasQuestion = has; cx.notify(); } });
    this.question.on("submit", (_e, cx) => this.ask("inline", cx));
    this.question.on("focus", (_e, cx) => { this.asking = true; cx.notify(); });
    this.question.on("blur", (_e, cx) => { this.asking = false; cx.notify(); });
    this.view = VIEWS.includes(this.read("view")) ? this.read("view") : "tree"; this.foldedDirs = new Set();
    this.flags = new Map(); this.verdicts = {}; this.triaging = false; this.guide = new GuideSource();
    this.sel = null; this.chat = { session: null, messages: [] }; this.hasQuestion = false; this.threadScroll = ScrollHandle.new(); this.scrollThreads = false; this.threadH = clamp(Number(this.read("threadH")) || 240, 90, 900); this.areaH = 700; this.vdrag = null;
    this.listH = Number(this.read("listH")) || 0; this.listSeen = 200; this.panelH = 800; this.ldrag = null; // listH 0: as tall as its rows
    // The review pane's comment list: its rows, whether it is wanted, and the thread a click on a row scrolls the diff to once it is drawn.
    this.diffScroll = VirtualListScrollHandle.new(); this.list = []; this.listOn = this.read("commentList") !== "0"; this.jump = null;
    // The review pane copy draws what the side panel publishes, taken in by a timer since render must not change state; it reads no git state of its own.
    this.comments = new CommentStore(isReviewPane()); this.sendDrafts = sender(this, this.comments); this.composer = null;
    this.commentInput = TextareaState.new({ placeholder: "Leave a comment. Ctrl+Enter queues it" });
    this.commentInput.set_auto_grow(2, 8);
    // The bar's Queue button is dim until something is typed, so redraw when the input fills or empties.
    this.commentInput.on("change", (_e, cx) => { const has = Boolean(this.commentInput.value().trim()); if (has !== this.hasComment) { this.hasComment = has; cx.notify(); } });
    // Only Ctrl+Enter (a secondary submit) queues, so plain Enter stays free for new lines in the comment.
    this.commentInput.on("submit", (e, cx) => { if (e?.secondary) submitComposer(this, cx); });
    this.commentInput.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.commentInput.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    if (isReviewPane()) {
      cx.timer.every(250, (cx) => {
        syncPane(this, key(), cx);
        if (this.comments.mirrorFrom(paneThreads(this.root, this.open))) cx.notify();
        const list = paneList(this.root);
        if (JSON.stringify(list) !== JSON.stringify(this.list)) { this.list = list; cx.notify(); }
      });
      return;
    }
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
    cx.timer.every(400, (cx) => { this.applyFocus(cx); const path = takeToggle(this); if (path) this.toggleReviewed(path, cx, true); const jump = takeJump(this); if (jump && this.files.some((f) => f.path === jump)) this.pick(jump, cx, true); if (this.comments.takeRequest(this.root, this.sendDrafts, cx)) { publishThreads(this); cx.notify(); } });
    cx.timer.every(3000, (cx) => this.pollComments(cx));
    cx.spawn(async (cx) => { for (;;) { this.command(await nextCommand(), cx); cx.notify(); } });
    // The chat runs tests too; watch for its runs while it answers.
    cx.timer.every(3000, (cx) => { if (this.root && (this.testsRunning() || this.chat.messages.some((m) => m.status === "pending") || this.comments.anyWaiting())) this.loadTests(cx); });
  }

  // `herdr-app do my-changes.<command>`, and what a key binding can send: range:work, range:commit, range:branch, next, prev, mark, open:<path>
  command(name, cx) {
    const [verb, arg] = [name.split(":")[0], name.includes(":") ? name.slice(name.indexOf(":") + 1) : ""];
    const order = this.fileOrder(), at = order.findIndex((f) => f.path === this.open);
    if (verb === "range") this.setRange(asRange(arg), cx);
    else if (verb === "mode") this.setMode(arg === "split" ? "split" : "unified", cx);
    else if (verb === "expand") this.toggleExpand();
    else if (verb === "click" || verb === "shiftclick") this.pickRow(`${this.mode}${arg}`, verb === "shiftclick", cx);
    else if (verb === "threadh") { this.threadH = clamp(Number(arg) || 240, 90, 900); this.write("threadH", String(this.threadH)); }
    else if (verb === "view") this.setView(VIEWS.includes(arg) ? arg : "tree");
    else if (verb === "triage") this.triage(cx);
    else if (verb === "listh") { this.listH = Number(arg) || 0; this.write("listH", String(this.listH)); }
    else if (verb === "tests") this.runTests(cx);
    else if (verb === "zed") this.openInEditor(cx);
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
      const target = order[at + (verb === "next" ? 1 : -1)];
      if (target) this.pick(target.path, cx, true);
    } else if (verb === "mark" && this.open) this.toggleReviewed(this.open, cx, true);
    else if (verb === "open" && arg) this.pick(arg, cx, true);
  }

  read(name) { try { return localStorage.getItem(name); } catch { return null; } }
  write(name, value) { try { localStorage.setItem(name, value); } catch { /* storage can be unavailable */ } }
  drawn(px) { return drawnPx(px, settings().zoom); }

  // The branch this one forked from: the coordinator guide's fork point when it is an ancestor of HEAD, else a child's own fork point from its base label, else the first of the usual names that exists and is not HEAD itself.
  async findBase(git, child) {
    const fromGuide = guideBase(this.guide.guide);
    if (fromGuide && (await git(["merge-base", "--is-ancestor", fromGuide.rev, "HEAD"])).code === 0) { this.baseAt = 0; return (this.base = fromGuide); }
    // A plain terminal can share a child's worktree, so the cache is per root and child base.
    const cacheKey = `${this.root}\0${child ?? ""}`;
    if (this.baseAt && Date.now() - this.baseAt < 30000 && this.baseRoot === cacheKey) return this.base;
    const fork = child ? await git(["merge-base", "HEAD", child]) : null;
    let found = fork?.code === 0 && fork.stdout.trim() ? { name: child, rev: fork.stdout.trim() } : null;
    for (const ref of found ? [] : BASES) {
      const ok = await git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      if (ok.code !== 0) continue;
      const mb = await git(["merge-base", "HEAD", ref]);
      if (mb.code !== 0 || !mb.stdout.trim()) continue;
      // origin/HEAD names no branch itself; show the one it points at ("master"), not "HEAD".
      const target = ref === "origin/HEAD" ? (await git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).stdout.trim() : "";
      found = { name: (target || ref).replace(/^origin\//, ""), rev: mb.stdout.trim() };
      break;
    }
    this.base = found; this.baseAt = Date.now(); this.baseRoot = cacheKey;
    return found;
  }

  // HEAD's first parent, where the "Last commit" range starts; null for a root commit.
  async findParent(git) {
    const r = await git(["log", "-1", "--format=%P%x00%s", "HEAD"]);
    const [parents = "", subject = ""] = r.code === 0 ? r.stdout.trim().split("\0") : [];
    const rev = parents.split(" ")[0];
    this.parent = rev ? { rev, subject } : null;
    return this.parent;
  }

  marksKey() { return `reviewed:${this.root}:${this.range === "work" ? "work" : this.against}`; }
  triageKey() { return `triage:${this.root}:${this.range === "work" ? "work" : this.against}`; }
  loadVerdicts() { try { this.verdicts = JSON.parse(this.read(this.triageKey()) ?? "{}") || {}; } catch { this.verdicts = {}; } }
  loadMarks() { try { this.marks = JSON.parse(this.read(this.marksKey()) ?? "{}") || {}; } catch { this.marks = {}; } }
  saveMarks() { this.write(this.marksKey(), JSON.stringify(this.marks)); }
  sig(f) { return `${f.status}:${f.add}:${f.del}`; }
  // The review pane shows the side panel's marks, which it reads from the panel's record.
  reviewed(f) { return this.record ? this.record.reviewed : this.marks[f.path]?.sig === this.sig(f) && !f.changedSince; }
  stale(f) { return this.record ? this.record.stale : Boolean(this.marks[f.path]) && !this.reviewed(f); }

  toggleReviewed(path, cx, advance = false) {
    if (this.record) { requestToggle(this.root, path); return; }
    const file = this.files.find((f) => f.path === path);
    if (!file) return;
    if (this.reviewed(file)) delete this.marks[path];
    else {
      this.marks[path] = { sig: this.sig(file), hash: file.hash ?? null };
      file.changedSince = false;
      if (advance) {
        const next = this.fileOrder().find((f) => f.path !== path && !this.reviewed(f));
        if (next) this.pick(next.path, cx, true);
      }
    }
    this.saveMarks(); publishReview(this); cx.notify();
  }

  lastKey() { return `last:${this.root}`; }
  rememberLast() { if (this.root && this.open) { this.lastPath = this.open; this.write(this.lastKey(), JSON.stringify({ path: this.open, range: this.userRange })); } }

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

  publishComments() { publishThreads(this); }

  // Answers agents sent back with hreview, read while a thread's newest comment or an Ask question went to an agent.
  pollComments(cx) {
    if (this.pollingComments || !(listening(this.comments.threads) || chatListening(this.chat.messages))) return;
    this.pollingComments = true;
    cx.spawn(async (cx) => {
      try {
        if (await pollReplies(this.comments, this.on ?? null)) { publishThreads(this); cx.notify(); }
        if (chatListening(this.chat.messages)) {
          const chat = this.chat, replies = await readReplies(this.on ?? null);
          const { messages, changed } = applyChatReplies(chat.messages, replies);
          if (changed && chat === this.chat) { chat.messages = messages; this.scrollThreads = true; this.saveChat(); cx.notify(); }
        }
      }
      finally { this.pollingComments = false; }
    });
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
    chat.messages = settleChat(chat.messages ?? []);
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
    return `You are the review assistant for the project at ${this.root}. The user is reviewing code that coding agents wrote. Answer questions by reading the code and, when asked why something was done, the agents' own conversation logs listed below (JSONL files). When the user asks for a change (a fix, a test, a rename), make it yourself with your edit tools instead of telling them what to paste, then say briefly what you changed. Only change what they asked for. Use git only to read: diff, log, show, status, blame; never commit. To run the project's tests, run exactly "${testScript()} run ${this.root}" (it finds the test command and records the result for the user). Run it after every edit you make and when the user asks whether things pass, and report how many passed and failed. Never run any other command. Be concise and point at file and line.\n\nAgents in this space right now:\n${lines.join("\n") || "- none"}`;
  }

  compose(question, snippet) {
    if (!snippet || !this.open) return question;
    const where = this.range === "branch" && this.base ? `everything since ${this.base.name}`
      : this.range === "commit" && this.parent ? `the last commit ("${this.parent.subject}") plus the uncommitted changes`
      : "the uncommitted changes";
    return `About ${this.open} (${where}), ${snippet.label}:\n\n${FENCE}diff\n${snippet.text}\n${FENCE}\n\n${question}`;
  }

  // Who answers the Ask box: the live agent the panel follows when it works in this folder, else claude -p.
  askTarget() { return pickTarget(terminals().find((x) => x.address === followedTerminal()), this.root); }

  ask(_kind, cx) {
    const question = this.question.value().trim();
    if (!question || !this.root || this.chat.messages.some((m) => m.status === "pending")) return;
    const snippet = this.open ? this.snippet() : null, target = this.askTarget();
    const message = { id: Date.now().toString(36), path: this.open ?? null, label: snippet?.label ?? "", q: question, a: "", status: "pending", at: Date.now() };
    if (target.kind === "agent") message.to = { address: target.address, name: target.name };
    this.chat.messages.push(message);
    this.scrollThreads = true;
    this.question.set_value(""); this.hasQuestion = false; this.sel = null;
    const root = this.root, on = this.on, prompt = this.compose(question, snippet), model = this.modelId, effort = this.effortId;
    this.saveChat(); cx.notify();
    if (message.to) {
      const to = message.to;
      cx.spawn(async (cx) => {
        const failed = await askAgent(message.id, prompt, to, on ?? null, cx);
        message.status = failed ? "error" : "sent"; message.a = failed ?? "";
        this.scrollThreads = true; this.saveChat(); cx.notify();
      });
      return;
    }
    cx.spawn(async (cx) => {
      try {
        if (this.chat.role !== ASK_ROLE) this.chat.session = null;
        const out = await this.askClaude(prompt, { root, on, model, effort, session: this.chat.session, onRetry: () => { this.chat.session = null; } });
        this.chat.session = out.session ?? this.chat.session;
        this.chat.role = ASK_ROLE;
        message.a = out.text;
        message.status = "done";
      } catch (e) { message.status = "error"; message.a = String(e.message ?? e); }
      this.scrollThreads = true; this.saveChat(); cx.notify();
    });
  }

  /** Sends one prompt to claude -p, resuming `session` when given (or forking it with `fork`), and starting afresh (after calling `onRetry`) when the resume fails. Resolves to the answer and the new session id; rejects with the error to show. */
  async askClaude(prompt, { root, on, model, effort, session, fork = false, onRetry }) {
    const system = await this.preamble();
    const send = (resume) => exec("claude", ["-p", "--output-format", "json", "--allowedTools", `${ASK_TOOLS},Bash(${testScript()} run:*)`, "--add-dir", `${home()}/.claude/projects`, "--append-system-prompt", system, ...(model !== "default" ? ["--model", model] : []), ...(effort !== "default" ? ["--effort", effort] : []), ...(resume ? ["--resume", resume, ...(fork ? ["--fork-session"] : [])] : []), "--", prompt], { cwd: root, on, timeout: 600000 });
    let r = await send(session);
    if (r.code !== 0 && session) { onRetry?.(); r = await send(null); }
    if (!r.stdout.trim()) throw new Error(r.stderr.trim() || "No answer came back.");
    const out = JSON.parse(r.stdout);
    if (r.code !== 0 || out.is_error) throw new Error(String(out.result || r.stderr || "The question failed."));
    return { text: String(out.result ?? "").trim() || "No answer came back.", session: out.session_id ?? null };
  }

  // One exchange, read like a chat: the question is a right-aligned bubble, the answer sits under the assistant's name beside a rail.
  threadCard(m, t, last) {
    const working = m.to ? (m.status === "sent" ? `Sent to ${m.to.name}. Waiting for its reply…` : `Sending to ${m.to.name}…`) : "Working…";
    const answer = m.status === "pending" || m.status === "sent"
      ? h_flex().gap(7).items_center().text_size(12).text_color(t.working).child(svg("mods/workspace-chrome/spinner.svg").size(13).flex_none().text_color(t.working).spin(900)).child(working)
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
          .child(div().flex_none().font_semibold().text_color(t.ansi5).child(m.to?.name ?? "Claude"))
          .child(div().min_w(0).truncate().text_color(t.dim).child(m.to ? "· the agent working in this folder" : "· reads, edits and tests the code, reads the agents' logs"))
          .child(div().flex_1())
          .when(m.status === "done", (e) => e.child(div().id(`copy-${m.id}`).flex_none().px(6).h(18).flex().items_center().rounded(4).cursor_pointer()
            .text_color(this.copied === m.id ? t.ansi2 : t.dim).hover((h) => h.bg(t.hover).text_color(t.foreground)).tooltip("Copy this answer")
            .on_click((_e, cx) => {
              cx.write_to_clipboard(m.a);
              this.copied = m.id; cx.notify();
              cx.timer.after(1500, (cx) => { if (this.copied === m.id) { this.copied = null; cx.notify(); } });
            })
            .child(this.copied === m.id ? "Copied" : "Copy"))))
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
    const ready = this.hasQuestion && !busy, target = this.askTarget(), who = target.kind === "agent" ? target.name : "Claude";
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
      .when(messages.length > 0, (e) => e.child(v_flex().id("threads").h(Math.min(this.threadH, Math.max(90, this.drawn(this.areaH) - 140))).overflow_y_scroll().track_scroll(this.threadScroll).p(12).gap(12).border_b(1).border_color(t.border).children(messages.map((m, i) => this.threadCard(m, t, i === messages.length - 1)))))
      .child(v_flex().p(10).gap(7)
        .child(h_flex().gap(6).items_center().flex_wrap().text_size(11).text_color(t.muted)
          .child(div().flex_1().min_w(120).truncate().child(this.sel ? `Asking ${who} about ${snippet.label} · Shift-click extends, Esc clears` : this.open ? `Asking ${who} about this file. Click a line to ask about it, Shift-click to extend.` : `Ask ${who} anything about this space.`))
          .when(target.kind === "claude", (e) => e
            .child(chip("ask-model", `Model: ${MODELS.find(([id]) => id === this.modelId)?.[1] ?? "Default"} \u25be`, "Choose the model for your next question", "model"))
            .child(chip("ask-effort", `Effort: ${EFFORTS.find(([id]) => id === this.effortId)?.[1] ?? "Default"} \u25be`, "Choose the effort for your next question", "effort")))
          .when(Boolean(this.sel), (e) => e.child(small("ask-clear", "Clear", "Ask about the whole file instead", (_e, cx) => { this.sel = null; cx.notify(); })))
          .when(messages.length > 0, (e) => e.child(small("ask-new", "New chat", "Start over: the assistant forgets this conversation", (_e, cx) => this.newChat(cx)))))
        .child(h_flex().gap(8)
          .child(div().id("ask-box").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(this.asking ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.question).h_full().text_size(12).text_color(t.foreground)))
          .child(div().id("ask-inline").h(32).px(14).flex().items_center().rounded(8).text_size(12).tooltip(target.kind === "agent" ? `Sends your question to ${who}, which answers here` : "One conversation for this space: it reads and edits the code and reads the agents' logs")
            .bg(ready ? t.solid : t.raised).text_color(ready ? t.solid_foreground : t.dim)
            .when(ready, (e) => e.cursor_pointer()).on_click((_e, cx) => { if (ready) this.ask("inline", cx); }).child(busy ? "Thinking…" : "Ask"))));
  }

  // The test command, the working tree's fingerprint and the last recorded run, from run-tests.sh.
  loadTests(cx) {
    const root = this.root, on = this.on;
    if (!root || this.testsLoading) return;
    this.testsLoading = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(testScript(), ["status", root], { cwd: root, on });
        if (this.root === root) this.tests = r.code === 0 ? JSON.parse(r.stdout) : null;
      } catch { if (this.root === root) this.tests = null; }
      finally { this.testsLoading = false; cx.notify(); }
    });
  }

  testsRunning() {
    const last = this.tests?.result;
    return Boolean(this.runningTests || (last?.running && Date.now() - last.at * 1000 < RUN_LIMIT_MS));
  }

  runTests(cx) {
    const root = this.root, on = this.on;
    if (!root || !this.tests?.cmd || this.testsRunning()) return;
    this.runningTests = true; cx.notify();
    cx.spawn(async (cx) => {
      try { await exec(testScript(), ["run", root], { cwd: root, on, timeout: 960000 }); }
      catch { /* the script records the failure itself */ }
      finally { this.runningTests = false; this.loadTests(cx); }
    });
  }

  testsRow(t) {
    const tests = this.tests;
    if (!tests) return null;
    const last = tests.result, running = this.testsRunning();
    const ago = last ? duration(Date.now() - last.at * 1000) : "";
    const passed = last && !last.running && last.code === 0;
    const outdated = last && !running && last.fp !== tests.fp;
    const [color, text] = !tests.cmd ? [t.dim, "Tests: no test command found"]
      : running ? [t.working, "Running tests\u2026"]
      : !last ? [t.muted, "Tests: not run yet"]
      : passed ? [t.ansi2, `\u2713 Tests passed \u00b7 ${last.summary} \u00b7 ${ago === "just now" ? ago : `${ago} ago`}`]
      : [t.blocked, `\u2717 Tests failed \u00b7 ${last.summary || `exit ${last.code}`} \u00b7 ${ago === "just now" ? ago : `${ago} ago`}`];
    return h_flex().h(30).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border).text_size(11.5)
      .when(running, (e) => e.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .child(div().min_w(0).truncate().text_color(color).child(text))
      .when(Boolean(outdated), (e) => e.child(div().flex_none().text_color(t.dim).tooltip("The code changed after this run").child("\u00b7 code changed since")))
      .child(div().flex_1())
      .when(Boolean(tests.cmd) && !running, (e) => e.child(div().id("tests-run").flex_none().px(8).h(20).flex().items_center().rounded(5).bg(t.raised).text_size(11).text_color(t.muted)
        .cursor_pointer().hover((h) => h.bg(t.hover).text_color(t.foreground)).tooltip(`Run ${tests.cmd}`)
        .on_click((_e, cx) => this.runTests(cx)).child(last ? "Run again" : "Run tests")));
  }

  // The new-side line to open at: the first selected line, else the first change in the file.
  editorLine() {
    const rows = this.rowsNow();
    const from = this.sel ? Math.min(this.sel.from, this.sel.to) : rows.findIndex((r) => r.kind === "+" || (r.kind === "pair" && r.right?.kind === "+"));
    for (let i = Math.max(0, from); i < rows.length; i++) {
      const r = rows[i], n = r.kind === "pair" ? r.right?.number : r.kind === "-" || r.kind === "@" ? undefined : r.number;
      if (n) return n;
    }
    return 1;
  }

  // Opens the file in Zed (the nightly build when it is installed, as the shell's `z` does) at the line in view.
  openInEditor(cx) {
    if (!this.root || !this.open) return;
    const root = this.root, target = `${root}/${this.open}:${this.editorLine()}`;
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", 'if command -v zed-nightly >/dev/null; then exec zed-nightly "$@"; else exec zed "$@"; fi', "sh", root, target], { cwd: root }).catch((e) => ({ code: 1, stderr: String(e) }));
      if (r.code !== 0) { this.note = `Could not open Zed: ${(r.stderr || "").trim() || `exit ${r.code}`}`; cx.notify(); }
    });
  }

  fileOrder() {
    if (this.view === "risk") return this.riskGroups().flatMap((g) => treeFiles(fileTree(g.files)));
    return this.view === "tree" ? treeFiles(fileTree(this.files)) : this.files;
  }

  setView(view) { this.view = view; this.write("view", view); }

  flagsOf(f) { return this.flags.get(f.path)?.flags ?? pathFlags(f); }
  verdictOf(f) { const v = this.verdicts[f.path]; return v && v.sig === this.sig(f) ? v : null; }
  guideEntry(f) { return this.range === "branch" && this.base ? this.guide.entry(f.path, this.sig(f)) : null; }
  levelFor(f) { return levelOf(this.flagsOf(f), this.guideEntry(f) ?? this.verdictOf(f)); }

  // Files by how closely to read them; within a level, the most rule flags first, then the biggest change.
  riskGroups() {
    const by = { high: [], normal: [], skim: [] };
    for (const f of this.files) by[this.levelFor(f)].push(f);
    const weight = (f) => this.flagsOf(f).filter((x) => x.level === "high").length;
    return LEVELS.map((level) => ({ level, files: by[level].sort((a, b) => weight(b) - weight(a) || (b.add + b.del) - (a.add + a.del) || a.path.localeCompare(b.path)) }));
  }

  riskRows() {
    const rows = [];
    if (this.files.some((f) => isCode(f.path)) && !this.files.some((f) => isTest(f.path))) rows.push({ kind: "note", text: "No test files changed in this diff" });
    for (const g of this.riskGroups()) {
      if (!g.files.length) continue;
      rows.push({ kind: "group", level: g.level, files: g.files });
      // Each group is its own folder tree; its folds are kept apart from the other groups' and the Tree view's.
      const fold = `${g.level}|`, folded = { has: (path) => this.foldedDirs.has(fold + path) };
      if (!this.foldedDirs.has(`risk:${g.level}`)) for (const row of treeRows(fileTree(g.files), folded)) rows.push({ ...row, fold });
    }
    return rows;
  }

  untriaged() { return this.files.filter((f) => !this.verdictOf(f)); }

  // Untracked files read whole: their text is their diff. Reading them also gives their line counts and finds binaries.
  async readFresh(files, root, on) {
    const out = new Map();
    for (const f of files.filter((x) => x.fresh).slice(0, 200)) {
      const text = await readTextFile(`${root}/${f.path}`, { on }).catch(() => null);
      if (text === null || text.includes("\0")) { f.binary = true; continue; }
      f.add = countLines(text);
      out.set(f.path, text.slice(0, 200000).replace(/\n$/, "").split("\n").map((l) => `+${l}`).join("\n"));
    }
    return out;
  }

  async trackedDiffs(git, files, against, hasHead, context) {
    const out = new Map(), paths = files.filter((f) => !f.fresh).map((f) => f.path);
    const runs = hasHead ? [["diff", against]] : [["diff", "--cached"], ["diff"]];
    for (let i = 0; i < paths.length; i += 100) {
      for (const args of runs) {
        const r = await git(["-c", "core.quotePath=false", ...args, `-U${context}`, "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", "--", ...paths.slice(i, i + 100)]);
        if (r.code !== 0) continue;
        for (const [path, text] of splitDiff(r.stdout)) out.set(path, out.has(path) ? `${out.get(path)}\n${text}` : text);
      }
    }
    return out;
  }

  // Rule flags for files whose change is new since the last look; the rest keep theirs.
  async updateFlags(git, files, against, hasHead, root, on) {
    const fresh = await this.readFresh(files, root, on);
    const subjects = new Set(files.filter((f) => isTest(f.path) && testsChangedCode(f.path, files)).map((f) => f.path));
    const stamp = (f) => `${this.sig(f)}:${f.binary ? "b" : ""}:${subjects.has(f.path) ? "t" : ""}`;
    const todo = files.filter((f) => this.flags.get(f.path)?.stamp !== stamp(f)).slice(0, 400);
    const needDiff = todo.filter((f) => !f.binary && pathFlags(f)[0]?.level !== "skim");
    const diffs = await this.trackedDiffs(git, needDiff, against, hasHead, 0);
    for (const f of todo) {
      const text = fresh.get(f.path) ?? diffs.get(f.path);
      const flags = [...pathFlags(f), ...(needDiff.includes(f) && text ? diffFlags(f, text, subjects.has(f.path)) : [])];
      this.flags.set(f.path, { stamp: stamp(f), flags });
    }
  }

  // Asks the model about every file it has not judged in its current state, then shows the files by risk.
  triage(cx) {
    if (!this.root || this.triaging) return;
    this.setView("risk");
    const judge = this.untriaged();
    if (!judge.length) { cx.notify(); return; }
    const root = this.root, on = this.on, store = this.triageKey(), all = [...this.files], against = this.against ?? "HEAD", hasHead = this.hasHead;
    const sigs = new Map(judge.map((f) => [f.path, this.sig(f)]));
    const model = this.modelId, effort = this.effortId;
    this.triaging = true; this.note = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const diffs = new Map([...await this.trackedDiffs(git, judge, against, hasHead, 3), ...await this.readFresh(judge, root, on)]);
        const prompt = triagePrompt(all, judge, diffs, (f) => this.flagsOf(f));
        const r = await exec("claude", ["-p", "--output-format", "json", "--tools", "", "--no-session-persistence", "--json-schema", VERDICT_SCHEMA, ...(model !== "default" ? ["--model", model] : []), ...(effort !== "default" ? ["--effort", effort] : []), "--", prompt], { cwd: root, on, timeout: 600000 });
        if (!r.stdout.trim()) throw new Error(r.stderr.trim() || "No answer came back.");
        const out = JSON.parse(r.stdout);
        if (r.code !== 0 || out.is_error) throw new Error(String(out.result || r.stderr || "The triage failed."));
        const list = out.structured_output?.files ?? JSON.parse(out.result).files;
        let saved = {};
        try { saved = JSON.parse(this.read(store) ?? "{}") || {}; } catch { saved = {}; }
        for (const path of Object.keys(saved)) if (!all.some((f) => f.path === path)) delete saved[path];
        for (const v of list) if (sigs.has(v.path) && LEVELS.includes(v.level)) saved[v.path] = { level: v.level, reason: String(v.reason ?? "").trim(), sig: sigs.get(v.path) };
        this.write(store, JSON.stringify(saved));
        if (this.root === root && this.triageKey() === store) this.verdicts = saved;
      } catch (e) { if (this.root === root) this.note = `Triage failed: ${String(e.message ?? e).slice(0, 300)}`; }
      finally { this.triaging = false; cx.notify(); }
    });
  }

  // The rule flags then the model's reason, as one line of text.
  whyText(f) {
    const guided = this.guideEntry(f);
    if (guided) return { flags: this.flagsOf(f), reason: guided.reason };
    const verdict = this.verdictOf(f);
    return { flags: this.flagsOf(f), reason: verdict ? verdict.reason : this.verdicts[f.path] ? "changed since triage" : "" };
  }

  listRow(row, t) {
    if (row.kind === "dir") return this.dirRow(row.dir, t, row.depth, row.fold ?? "");
    if (row.kind === "group") return this.groupRow(row, t);
    if (row.kind === "note") return div().h(ROW_H.note).flex_none().px(10).flex().items_center().text_size(11).text_color(t.working).child(`⚑ ${row.text}`);
    return this.fileRow(row.f, t, row.depth, this.view);
  }

  rowHeight(row) { return row.kind === "file" ? (this.view === "risk" ? ROW_H.risk : ROW_H.file) : ROW_H[row.kind]; }

  // A tinted band with a bar in the level's colour, so the three groups read apart at a glance.
  groupRow(row, t) {
    const done = row.files.filter((f) => this.reviewed(f)).length, id = `risk:${row.level}`, open = !this.foldedDirs.has(id);
    const tone = t[LEVEL_TONE[row.level]];
    return h_flex().id(`group-${row.level}`).h(ROW_H.group - 6).mt(6).flex_none().pl(0).pr(10).gap(8).items_center().rounded(6).overflow_hidden().cursor_pointer()
      .bg(fade(tone, "1f")).hover((s) => s.bg(fade(tone, "33")))
      .on_click((_e, cx) => this.toggleDir(id, cx))
      .child(div().w(3).h_full().flex_none().bg(tone))
      .child(div().w(12).flex_none().text_size(10).text_color(tone).text_center().child(open ? "▾" : "▸"))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_semibold().text_color(tone).child(LEVEL_LABEL[row.level]))
      .child(div().flex_none().text_size(11).text_color(done === row.files.length ? t.ansi2 : t.foreground).child(`${done}/${row.files.length} reviewed`));
  }

  toggleDir(path, cx) {
    if (this.foldedDirs.has(path)) this.foldedDirs.delete(path); else this.foldedDirs.add(path);
    cx.notify();
  }

  // A flag count in the tree and list; the Risk view spells the flags and the reason out under the name instead.
  flagTag(f, t) {
    const shown = this.flagsOf(f).filter((x) => x.level !== "skim");
    if (!shown.length) return null;
    return div().id(`flags-${f.path}`).flex_none().text_size(10).text_color(shown.some((x) => x.level === "high") ? t.blocked : t.muted)
      .tooltip(shown.map((x) => x.text).join("\n")).child(`⚑ ${shown.length}`);
  }

  whyLine(f, t) {
    const { flags, reason } = this.whyText(f);
    const tip = [...flags.map((x) => x.text), reason].filter(Boolean).join("\n");
    const settled = Boolean(reason) && reason !== "changed since triage";
    return h_flex().id(`why-${f.path}`).h(16).pl(46).gap(6).min_w(0).overflow_hidden().text_size(11.5).whitespace_nowrap()
      .when(Boolean(tip), (e) => e.tooltip(tip))
      .children(flags.map((x) => div().flex_none().text_color(x.level === "high" ? t.blocked : t.muted).child(`⚑ ${x.text}`)))
      .child(div().min_w(0).truncate().text_color(settled ? fade(t.foreground, "c8") : t.dim).child(reason || (flags.length ? "" : "not triaged yet")));
  }

  fileRow(f, t, depth, view) {
    const parts = f.path.split("/"), name = parts.pop(), tree = view !== "list", risk = view === "risk";
    const tag = risk ? null : this.flagTag(f, t);
    const line = h_flex().h(ROW_H.file).flex_none().gap(8).items_center()
      .child(div().id(`reviewed-${f.path}`).size(16).flex_none().rounded(4).border_1().border_color(this.reviewed(f) ? t.ansi2 : t.border)
        .when(this.reviewed(f), (e) => e.bg(t.ansi2 + "30")).flex().items_center().justify_center().cursor_pointer()
        .on_click((_e, cx) => { cx.stop_propagation(); this.toggleReviewed(f.path, cx); })
        .when(this.reviewed(f), (e) => e.child(svg("mods/workspace-chrome/check.svg").size(11).text_color(t.ansi2))))
      .child(div().w(14).text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
      .child(h_flex().flex_1().min_w(0).when(!tree, (e) => e.child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : ""))).child(div().max_w(260).min_w(0).truncate().text_color(this.reviewed(f) ? t.dim : t.foreground).child(name)))
      .when(Boolean(tag), (e) => e.child(tag))
      .when(this.chat.messages.some((m) => m.path === f.path), (e) => e.child(div().id(`asked-${f.path}`).text_size(10).text_color(t.accent).tooltip("Questions you asked the chat about this file").child(`${this.chat.messages.filter((m) => m.path === f.path).length} asked`)))
      .when(this.stale(f), (e) => e.child(div().text_size(10).text_color(t.blocked).child("changed")))
      .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`\u2212${f.del}`)));
    return v_flex().id(`change-${f.path}`).h(risk ? ROW_H.risk : ROW_H.file).flex_none().pl(8 + depth * 16).pr(8).rounded(7).cursor_pointer()
      .when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(f.path, cx, openReviewPane()))
      .child(line).when(risk, (e) => e.child(this.whyLine(f, t)));
  }

  // Above the open file's diff: why it sorted where it did.
  whyBanner(f, t) {
    const { flags, reason } = this.whyText(f);
    if (!flags.length && !reason) return null;
    const level = this.levelFor(f);
    return h_flex().flex_none().px(12).py(5).gap(6).flex_wrap().items_center().border_b(1).border_color(t.border).text_size(11.5)
      .child(div().flex_none().font_semibold().text_color(t[LEVEL_TONE[level]]).child(LEVEL_LABEL[level]))
      .children(flags.map((x) => div().text_color(x.level === "high" ? t.blocked : t.dim).child(`\u00b7 \u2691 ${x.text}`)))
      .when(Boolean(reason), (e) => e.child(div().text_color(t.foreground).child(`\u00b7 ${reason}`)));
  }

  // fold: the key prefix of the Risk group this folder sits in ("" in the Tree view).
  dirRow(dir, t, depth, fold = "") {
    const inside = treeFiles(dir), done = inside.filter((f) => this.reviewed(f)).length;
    const add = inside.reduce((n, f) => n + f.add, 0), del = inside.reduce((n, f) => n + f.del, 0);
    const open = !this.foldedDirs.has(fold + dir.path);
    return h_flex().id(`dir-${fold}${dir.path}`).h(26).flex_none().pl(8 + depth * 16).pr(8).gap(6).items_center().rounded(7).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.toggleDir(fold + dir.path, cx))
      .child(div().w(16).flex_none().text_size(10).text_color(t.dim).text_center().child(open ? "\u25be" : "\u25b8"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(`${dir.name}/`))
      .child(div().text_size(10).text_color(done === inside.length ? t.ansi2 : t.dim).child(`${done}/${inside.length}`))
      .when(add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${add}`))).when(del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`\u2212${del}`)));
  }

  setRange(range, cx) {
    this.userRange = range;
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
      this.context = context; this.root = null; this.files = []; this.open = null; this.tests = null; this.base = null; this.baseAt = 0; this.parent = null; this.verdicts = {};
      this.setLines([]); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.tests = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        this.root = root;
        if (await this.guide.sync(root, head.stdout.trim(), on)) this.view = "risk";
        const child = childBase(terminals().find((x) => x.address === followedTerminal()), root);
        if (this.restoredFor !== root) {
          this.restoredFor = root; this.range = this.userRange;
          try { const last = JSON.parse(this.read(this.lastKey()) ?? "null"); if (RANGES.includes(last?.range)) this.range = last.range; this.lastPath = last?.path ?? null; } catch { this.lastPath = null; }
          // A child's whole work is everything since its fork point; what the user last picked stays remembered.
          this.userRange = this.range;
          if (child) this.range = "branch";
        }
        const base = head.code === 0 ? await this.findBase(git, child) : null;
        const parent = head.code === 0 ? await this.findParent(git) : null;
        const against = this.range === "branch" && base ? base.rev : this.range === "commit" && parent ? parent.rev : "HEAD";
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
        if (this.flagsFor !== `${root}|${against}`) { this.flagsFor = `${root}|${against}`; this.flags = new Map(); }
        try { await this.updateFlags(git, files, against, head.code === 0, root, on); } catch { /* flags are a hint; the list still shows */ }
        if (key() !== context) return;
        this.loadMarks(); this.loadVerdicts(); this.comments.sync(root);
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
        // The pane's comment list follows the file list even when the open file stays the same.
        publishThreads(this);
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); if (this.pending) { this.pending = false; this.refresh(cx); } }
      if (this.root) this.loadTests(cx);
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
      publishReview(this);
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
    this.sel = null; this.composer = null;
    this.open = this.open === path && !force ? null : path;
    if (this.open) for (const dir of [...this.foldedDirs]) if (this.open.startsWith(`${dir.slice(dir.indexOf("|") + 1)}/`)) this.foldedDirs.delete(dir);
    if (this.open) { this.scrollThreads = true; this.lastPath = this.open; this.write(this.lastKey(), JSON.stringify({ path: this.open, range: this.userRange })); } this.setLines([]); this.note = null;
    this.closed = !this.open;
    publishReview(this);
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
    const drawnW = this.drawn(this.diffW);
    const key = `${Math.round(drawnW)}|${this.ratio.toFixed(3)}|${this.splitVersion}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const width = Math.max(200, drawnW);
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

  diffRow(row, t, selected = false, marked = false) {
    const { kind, number, text } = row;
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18")).when(selected, (e) => e.bg(t.accent + "33"))
      .child(div().w(30).flex_none().text_right().text_color(marked ? t.accent : t.dim).when(marked, (e) => e.border_l(2).border_color(t.accent)).child(number === undefined ? "" : String(number)))
      .child(this.code(row, t));
  }

  splitRow(row, t, selected = false, marked = false) {
    if (row.kind === "@") return div().w_full().px(12).h(LINE_H).flex_none().truncate().bg(t.raised).text_color(t.dim).child(row.text);
    if (row.kind !== "pair") return div().w_full().px(12).h(LINE_H).flex_none().truncate().text_color(t.dim).child(row.text);
    const side = (r, lines, width) => h_flex().w(width).flex_none().h(row.n * LINE_H).gap(GAP).overflow_hidden()
      .when(Boolean(r) && r.kind === "-", (e) => e.bg(t.ansi1 + "18")).when(Boolean(r) && r.kind === "+", (e) => e.bg(t.ansi2 + "18")).when(!r, (e) => e.bg(t.raised + "80")).when(selected && Boolean(r), (e) => e.bg(t.accent + "33"))
      .child(div().w(NUMBER_W).h(LINE_H).flex_none().text_right().text_color(marked && r ? t.accent : t.dim).when(marked && Boolean(r), (e) => e.border_l(2).border_color(t.accent)).child(r?.number === undefined ? "" : String(r.number)))
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

  seg(t, id, label, on, enabledSeg, click) {
    return div().id(id).px(9).h(24).flex().items_center().rounded(6).text_size(12)
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : enabledSeg ? t.muted : t.dim)
      .when(enabledSeg, (e) => e.cursor_pointer().hover((h) => h.bg(on ? t.selected : t.hover))).on_click(enabledSeg ? click : () => {}).child(label);
  }

  // The open file's name, the Unified/Split switch (and in the review pane the comment list's toggle, off when the pane is too narrow for it), Open in Zed and Mark reviewed.
  fileBar(openFile, t) {
    const roomy = listShown(true, this.drawn(this.barW));
    return v_flex().flex_none().px(12).py(6).gap(6).border_b(1).border_color(t.border)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.barW) > 1) { this.barW = size.width; cx.notify(); } })
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(this.open))
        .when(Boolean(openFile && this.stale(openFile)), (e) => e.child(div().flex_none().text_size(11).text_color(t.blocked).child("changed since you reviewed")))
        .when(this.truncated, (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child(`first ${MAX_ROWS.toLocaleString()} lines`))))
      .child(h_flex().gap(8).gap_y(6).flex_wrap().items_center()
        .child(h_flex().gap(2).flex_none()
          .child(this.seg(t, "mode-unified", "Unified", this.mode === "unified", true, (_e, cx) => this.setMode("unified", cx)))
          .child(this.seg(t, "mode-split", "Split", this.mode === "split", true, (_e, cx) => this.setMode("split", cx)))
          .when(!this.record, (e) => e.child(this.seg(t, "expand", "⤢", false, true, (_e, cx) => { this.toggleExpand(); cx.notify(); }))))
        .when(Boolean(this.record), (e) => e.child(this.seg(t, "comment-list-toggle", "Comments", this.listOn && roomy, roomy,
          (_e, cx) => { this.listOn = !this.listOn; this.write("commentList", this.listOn ? "1" : "0"); cx.notify(); })))
        .child(div().flex_1())
        .child(div().id("open-zed").h(26).px(10).flex().flex_none().items_center().rounded(6).cursor_pointer().text_size(12).bg(t.raised).text_color(t.muted)
          .hover((h) => h.bg(t.hover).text_color(t.foreground)).tooltip("Open in Zed at the selected line, or the first change (key: o)")
          .on_click((_e, cx) => this.openInEditor(cx)).child(this.drawn(this.barW) < COMPACT_BAR ? "Zed" : "Open in Zed"))
        .child(div().id("mark-reviewed").h(26).px(10).flex().flex_none().items_center().rounded(6).cursor_pointer().text_size(12)
          .bg(openFile && this.reviewed(openFile) ? t.raised : t.solid).text_color(openFile && this.reviewed(openFile) ? t.muted : t.solid_foreground)
          .on_click((_e, cx) => this.toggleReviewed(this.open, cx, true))
          .child(openFile && this.reviewed(openFile) ? "Reviewed (undo)" : "Mark reviewed")));
  }

  // The open file's diff, unified or split, with the split's drag handle.
  diffBox(t, splitting) {
    const lay = commentLayout(this, splitting);
    if (this.jump && Date.now() - this.jump.at > 5000) this.jump = null;
    const jumpAt = this.jump?.path === this.open ? lay.items.findIndex((it) => "block" in it && it.block.thread?.id === this.jump.id) : -1;
    if (jumpAt >= 0) { this.diffScroll.scroll_to_item(jumpAt); this.jump = null; }
    const draw = (it) => ("block" in it ? blockView(it.block, t, lay)
      : splitting ? this.splitRow(this.split[it.row], t, this.isSel(it.row), lay.marked.has(it.row)) : this.diffRow(this.rows[it.row], t, this.isSel(it.row), lay.marked.has(it.row)));
    // The comment bar sits under the diff, not over it, so it never covers the last rows.
    return v_flex().flex_1().min_h(0).child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
      .on_mouse_down("left", (ev) => { this.shift = Boolean(ev.modifiers?.shift); })
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.diffW) > 1) { this.diffW = size.width; cx.notify(); } })
      .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
        .child(div().w_full().min_w(splitting ? 0 : this.diffWidth).h_full().child(v_virtual_list("changes-diff", lay.items.length, lay.heights, (i) => ("block" in lay.items[i] ? `${this.mode}${lay.items[i].block.key}` : `${this.mode}${lay.items[i].row}`),
          (range) => lay.items.slice(range.start, range.end).map(draw)).size_full().track_scroll(this.diffScroll)
            .on_item_click((key, cx) => { const extend = this.shift; this.shift = false; if (!clickBlock(this, key, cx)) this.pickRow(key, extend, cx); })
            .on_item_secondary_click((key, _ev, cx) => { if (!clickBlock(this, key, cx)) this.pickRow(key, true, cx); }))))
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
      .children([composerBar(this, t)].filter(Boolean));
  }

  render(cx) {
    if (props()?.menu) return this.menuView(theme());
    if (isReviewPane()) return paneView(this);
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const openFile = this.files.find((f) => f.path === this.open), banner = openFile ? this.whyBanner(openFile, t) : null;
    const listRows = this.view === "tree" ? treeRows(fileTree(this.files), this.foldedDirs) : this.view === "risk" ? this.riskRows() : this.files.map((f) => ({ kind: "file", f, depth: 0 }));
    const listFit = listRows.reduce((n, row) => n + this.rowHeight(row), 12);
    const untriaged = this.untriaged().length, judged = Object.keys(this.verdicts).length > 0;
    const showTriage = this.files.length > 0 && (this.triaging || untriaged > 0 || this.view !== "risk");
    const splitting = this.mode === "split", paned = paneShown();
    if (splitting) this.layoutSplit();
    const reviewedCount = this.files.filter((f) => this.reviewed(f)).length;
    return v_flex().id("changes").relative().size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(this.holds() ? t.accent : t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "c" && !this.typing && !this.asking && !e.modifiers.control && !e.modifiers.alt && this.sel) { openComposer(this, cx); cx.stop_propagation(); return; }
        if (e.key === "o" && !this.typing && !this.asking && !e.modifiers.control && !e.modifiers.alt && !e.modifiers.shift && this.open) { this.openInEditor(cx); cx.stop_propagation(); return; }
        if (e.key === "tab" && !this.typing && !this.asking && !e.modifiers.control && !e.modifiers.alt && !e.modifiers.shift) { this.question.focus(); cx.stop_propagation(); cx.notify(); return; }
        const step = { down: "next", j: "next", up: "prev", k: "prev" }[e.key];
        if (step && !this.typing && !this.asking && !e.modifiers.control && !e.modifiers.alt && !e.modifiers.shift) { this.command(step, cx); cx.stop_propagation(); cx.notify(); return; }
        if (e.key === "escape" && this.composer) { closeComposer(this, cx); cx.stop_propagation(); return; }
        if (e.key === "escape" && !this.typing && !this.asking && this.sel) { this.sel = null; cx.stop_propagation(); cx.notify(); return; }
        if (e.key === "escape" && (this.typing || this.asking)) { this.typing = false; this.asking = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Changes"))
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${this.files.length} files`))
        .child(div().id("view-toggle").px(6).h(20).flex().items_center().rounded(5).bg(t.raised).text_size(11).text_color(t.muted).cursor_pointer()
          .hover((h) => h.bg(t.hover).text_color(t.foreground)).tooltip({ tree: "Folder tree. Click for a flat list", list: "Flat list. Click to sort by risk", risk: "By risk. Click for the folder tree" }[this.view])
          .on_click((_e, cx) => { this.setView(VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length]); cx.notify(); }).child(VIEW_LABEL[this.view]))
        .when(showTriage, (e) => e.child(h_flex().id("triage").px(7).h(20).gap(5).items_center().rounded(5).text_size(11)
          .bg(this.triaging ? t.raised : t.accent + "30").text_color(this.triaging ? t.working : t.foreground)
          .when(!this.triaging, (b) => b.cursor_pointer().hover((h) => h.bg(t.accent + "50")))
          .tooltip("Sort the files by how closely to read them, with a reason for each. Nothing is hidden: every file still needs its review tick")
          .on_click((_e, cx) => this.triage(cx))
          .when(this.triaging, (b) => b.child(svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
          .child(this.triaging ? "Triaging…" : judged && untriaged > 0 ? `Triage ${untriaged} more` : "Triage")))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`)))
      .child(h_flex().min_h(36).py(4).flex_none().flex_wrap().px(10).gap(4).gap_y(4).items_center().border_b(1).border_color(t.border)
        .child(this.seg(t, "range-work", "Uncommitted", this.range === "work", true, (_e, cx) => this.setRange("work", cx)))
        .child(this.seg(t, "range-commit", "Last commit", this.range === "commit", Boolean(this.parent), (_e, cx) => this.setRange("commit", cx))
          .tooltip(this.parent ? `Since the parent of HEAD: "${this.parent.subject}" plus uncommitted changes` : "HEAD has no parent commit"))
        .child(this.seg(t, "range-branch", this.base ? `Since ${this.base.name}` : "Since base", this.range === "branch", Boolean(this.base), (_e, cx) => this.setRange("branch", cx))
          .tooltip(this.base ? `The whole branch: every commit since it forked from ${this.base.name}, plus uncommitted changes` : "No base branch found"))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(this.files.length && reviewedCount === this.files.length ? t.ansi2 : t.muted).child(`${reviewedCount}/${this.files.length} reviewed`)))
      .when(Boolean(this.tests && this.root), (e) => e.child(this.testsRow(t)))
      .children([this.guide.bar(t, this)].filter(Boolean))
      // overflow_y_scrollbar() wraps the list, so its flex sizing never reached the panel's layout.
      .child(div().id("changes-list-box").min_h(44).relative()
        .when(this.listH > 0, (e) => e.flex_none().h(clamp(this.listH, 44, Math.max(44, this.drawn(this.panelH) - 200))))
        .when(!this.listH, (e) => e.flex_1().max_h(listFit))
        .on_size_change((size, cx) => { if (Math.abs(size.height - this.listSeen) > 1) { this.listSeen = size.height; cx.notify(); } })
        .child(v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().p(6).children(listRows.map((row) => this.listRow(row, t))).when(!this.files.length, (e) => e.child(coordinatorNote(t, terminals(), followedTerminal()) ?? div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? (this.range === "work" ? "No uncommitted changes" : "No changes") : "No folder")))))
        .child(Scrollbar.vertical("changes-list").absolute().inset_0()))
      .child(div().id("list-handle").w_full().h(7).flex_none().flex().items_center().cursor_row_resize().hover((h) => h.bg(t.hover))
        .tooltip("Drag to resize the file list; double-click to fit it to the files")
        .on_mouse_down("left", (ev, cx) => {
          cx.stop_propagation();
          if (ev.click_count === 2) { this.listH = 0; this.write("listH", "0"); }
          else this.ldrag = { y: ev.position.y, h: this.drawn(this.listSeen) };
          cx.notify();
        })
        .child(div().w_full().h(1).bg(t.border)))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .when(Boolean(openFile) && !paned, (el) => el.child(this.fileBar(openFile, t)))
      .when(Boolean(banner), (el) => el.child(banner))
      .child(v_flex().id("review-area").flex_1().min_h(0).relative()
        .on_size_change((size, cx) => { if (Math.abs(size.height - this.areaH) > 1) { this.areaH = size.height; cx.notify(); } })
        .on_mouse_down_out((_e, cx) => { if (this.sel) { this.sel = null; cx.notify(); } })
        .when(!paned, (e) => e.child(this.diffBox(t, splitting)))
        .when(Boolean(this.open) && Boolean(this.root), (e) => e.child(this.askPanel(t)))
        .when(Boolean(this.vdrag), (e) => e.child(div().id("threads-drag").absolute().inset_0().cursor_row_resize()
          .on_mouse_move((ev, cx) => { this.threadH = clamp(this.vdrag.h + this.drawn(this.vdrag.y - ev.position.y), 90, Math.max(90, this.drawn(this.areaH) - 140)); cx.notify(); })
          .on_mouse_up("left", (_ev, cx) => { this.vdrag = null; this.write("threadH", String(Math.round(this.threadH))); cx.notify(); }))))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)))
      .on_size_change((size, cx) => { if (Math.abs(size.height - this.panelH) > 1) { this.panelH = size.height; cx.notify(); } })
      .when(Boolean(this.ldrag), (e) => e.child(div().id("list-drag").absolute().inset_0().cursor_row_resize()
        .on_mouse_move((ev, cx) => { this.listH = clamp(this.ldrag.h + this.drawn(ev.position.y - this.ldrag.y), 44, Math.max(44, this.drawn(this.panelH) - 200)); cx.notify(); })
        .on_mouse_up("left", (_ev, cx) => { this.ldrag = null; this.write("listH", String(Math.round(this.listH))); cx.notify(); })));
  }
}
