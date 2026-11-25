// The comment threads a Changes view shows. The side panel owns them (localStorage per folder, shared by every range); the review pane mirrors the panel's and sends it requests through shared state.

import { shared, setShared } from "herdr";
import { parseThreads, settleAfterReload, loadThreads, storeKey, newThread, addReply, editDraft, discardDraft, setResolved, removeThread, threadId, waiting, isDraft } from "./comment_threads.js";
import { COMMENT_KEY, requestToApply } from "./comment_share.js";
import { draftsOf } from "./comment_batch.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {import("./comment_anchor.js").Anchor} Anchor */
/** @typedef {(cx: any) => unknown} Send sends every draft as one batch */

const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

/** A folder's threads, merging the legacy per-range keys into its own key on first load. They are removed only once that write lands. @param {string} root */
function readThreads(root) {
  const { threads, write, drop } = loadThreads(readJson, root);
  if (write && writeJson(storeKey(root), write)) for (const key of drop) try { localStorage.removeItem(key); } catch { /* storage can be unavailable */ }
  return threads;
}

export class CommentStore {
  /** @param {boolean} mirror true in the review pane, which never writes storage */
  constructor(mirror) { this.mirror = mirror; this.key = null; /** @type {Thread[]} */ this.threads = []; this.collapsed = new Set(); this.version = 0; this.seen = null; this.mirrorDrafts = 0; }

  /** Loads a folder's threads when the folder changes; a range switch keeps them, and the view shows those of the open file. Owner only. @param {string} root */
  sync(root) {
    const key = storeKey(root);
    if (this.mirror || key === this.key) return;
    this.key = key; this.threads = settleAfterReload(readThreads(root)); this.version++;
  }

  /** In the pane: takes the threads and draft count the panel published, when they differ. @param {{ threads: Thread[], drafts: number } | null} got */
  mirrorFrom(got) {
    const next = got?.threads ?? [], drafts = got?.drafts ?? 0;
    if (drafts === this.mirrorDrafts && JSON.stringify(next) === JSON.stringify(this.threads)) return false;
    this.threads = next; this.mirrorDrafts = drafts; this.version++;
    return true;
  }

  /** Changes the threads stored under `key`, which may no longer be the ones on screen when an answer arrives late. @param {string} key @param {(ts: Thread[]) => Thread[]} change */
  update(key, change) {
    if (key !== this.key) { writeJson(key, change(parseThreads(readJson(key)))); return; }
    this.threads = change(this.threads); this.version++;
    writeJson(key, this.threads);
  }

  /** The threads stored under `key`, on screen or not. @param {string} key */
  threadsAt(key) { return key === this.key ? this.threads : parseThreads(readJson(key)); }

  /** Unsent comments in every file of this view; the pane only has the count the panel published. */
  drafts() { return this.mirror ? this.mirrorDrafts : draftsOf(this.threads).length; }

  /** @param {string} path */
  forFile(path) { return this.threads.filter((t) => t.path === path); }
  /** @param {string} id */
  find(id) { return this.threads.find((t) => t.id === id) ?? null; }
  anyWaiting() { return this.threads.some(waiting); }

  /** Collapse is each view's own, so it never round-trips. @param {string} id */
  toggle(id) { if (!this.collapsed.delete(id)) this.collapsed.add(id); this.version++; }

  /** A new thread on `anchor`, saved as a draft until Send. From the pane, a request to the panel. @param {{ root: string, path: string, anchor: Anchor, text: string }} spec */
  add({ root, path, anchor, text }) {
    if (this.mirror) { setShared(COMMENT_KEY, { op: "add", root, path, anchor, text, ts: Date.now() }); return; }
    this.update(this.key, (ts) => [...ts, newThread({ id: threadId(), path, anchor, q: text, now: Date.now() })]);
  }

  /** Sends every draft as one batch. From the pane, a request to the panel, which owns the threads. @param {{ root: string, path: string }} where @param {Send} send @param {any} cx */
  send({ root, path }, send, cx) {
    if (this.mirror) { if (path) setShared(COMMENT_KEY, { op: "send", root, path, text: "", ts: Date.now() }); return null; }
    return send(cx);
  }

  /** Reply (a new draft), edit or discard the draft, resolve, reopen or delete. From the pane, a request to the panel. @param {"reply" | "edit" | "discard" | "resolve" | "reopen" | "delete"} op @param {{ root: string, path: string, id: string, text?: string }} spec */
  act(op, { root, path, id, text = "" }) {
    if (this.mirror) { setShared(COMMENT_KEY, { op, root, path, thread: id, text, ts: Date.now() }); return; }
    const thread = this.find(id);
    // One draft per thread: a second reply would stack, so the composer edits the draft instead.
    if (!thread || (["reply", "edit"].includes(op) && !text.trim()) || (op === "reply" && (waiting(thread) || isDraft(thread)))) return;
    const change = { reply: (ts) => addReply(ts, id, text, Date.now()), edit: (ts) => editDraft(ts, id, text), discard: (ts) => discardDraft(ts, id), resolve: (ts) => setResolved(ts, id, true), reopen: (ts) => setResolved(ts, id, false), delete: (ts) => removeThread(ts, id) }[op];
    this.update(this.key, change);
  }

  /** In the panel: applies the pane's newest request once. @param {string | null} root @param {Send} send @param {any} cx @returns {boolean} whether one applied */
  takeRequest(root, send, cx) {
    const { request, seen } = requestToApply(shared(COMMENT_KEY), this.seen, root, Date.now());
    this.seen = seen;
    if (!request || this.mirror) return false;
    if (request.op === "add") this.add(request);
    else if (request.op === "send") send(cx);
    else this.act(request.op, { root: request.root, path: request.path, id: request.thread, text: request.text });
    return true;
  }
}
