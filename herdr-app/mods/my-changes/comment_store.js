// The comment threads a Changes view shows. The side panel owns them (localStorage per folder and range); the review pane mirrors the panel's and sends it requests through shared state.

import { shared, setShared } from "herdr";
import { parseThreads, settleAfterReload, newThread, addReply, setResolved, removeThread, threadId, waiting } from "./comment_threads.js";
import { COMMENT_KEY, requestToApply } from "./comment_share.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {import("./comment_anchor.js").Anchor} Anchor */
/** @typedef {(key: string, id: string, cx: any) => void} Deliver sends a thread's newest comment */

const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage can be unavailable */ } };

/** The storage key for a folder and range. The range name, not its commit, so threads outlive a new commit and re-anchor. @param {string} root @param {string} range */
export const storeKey = (root, range) => `comments:${root}:${range}`;

export class CommentStore {
  /** @param {boolean} mirror true in the review pane, which never writes storage */
  constructor(mirror) { this.mirror = mirror; this.key = null; /** @type {Thread[]} */ this.threads = []; this.collapsed = new Set(); this.version = 0; this.seen = null; }

  /** Loads the threads for a folder and range when they change. Owner only. @param {string} root @param {string} range */
  sync(root, range) {
    const key = storeKey(root, range);
    if (this.mirror || key === this.key) return;
    this.key = key; this.threads = settleAfterReload(parseThreads(readJson(key))); this.version++;
  }

  /** In the pane: takes the threads the panel published, when they differ. @param {Thread[] | null} threads */
  mirrorFrom(threads) {
    const next = threads ?? [];
    if (JSON.stringify(next) === JSON.stringify(this.threads)) return false;
    this.threads = next; this.version++;
    return true;
  }

  /** Changes the threads stored under `key`, which may no longer be the ones on screen when an answer arrives late. @param {string} key @param {(ts: Thread[]) => Thread[]} change */
  update(key, change) {
    if (key !== this.key) { writeJson(key, change(parseThreads(readJson(key)))); return; }
    this.threads = change(this.threads); this.version++;
    writeJson(key, this.threads);
  }

  /** @param {string} path */
  forFile(path) { return this.threads.filter((t) => t.path === path); }
  /** @param {string} id */
  find(id) { return this.threads.find((t) => t.id === id) ?? null; }
  anyWaiting() { return this.threads.some(waiting); }

  /** Collapse is each view's own, so it never round-trips. @param {string} id */
  toggle(id) { if (!this.collapsed.delete(id)) this.collapsed.add(id); this.version++; }

  /** A new thread on `anchor`, then its delivery. From the pane, a request to the panel. @param {{ root: string, path: string, anchor: Anchor, text: string }} spec @param {Deliver} deliver @param {any} cx */
  add({ root, path, anchor, text }, deliver, cx) {
    if (this.mirror) { setShared(COMMENT_KEY, { op: "add", root, path, anchor, text, ts: Date.now() }); return; }
    const id = threadId(), key = this.key;
    this.update(key, (ts) => [...ts, newThread({ id, path, anchor, q: text, now: Date.now() })]);
    deliver(key, id, cx);
  }

  /** Reply, resolve, reopen or delete. From the pane, a request to the panel. @param {"reply" | "resolve" | "reopen" | "delete"} op @param {{ root: string, path: string, id: string, text?: string }} spec @param {Deliver} deliver @param {any} cx */
  act(op, { root, path, id, text = "" }, deliver, cx) {
    if (this.mirror) { setShared(COMMENT_KEY, { op, root, path, thread: id, text, ts: Date.now() }); return; }
    const thread = this.find(id);
    if (!thread || (op === "reply" && (!text.trim() || waiting(thread)))) return;
    const change = { reply: (ts) => addReply(ts, id, text, Date.now()), resolve: (ts) => setResolved(ts, id, true), reopen: (ts) => setResolved(ts, id, false), delete: (ts) => removeThread(ts, id) }[op];
    const key = this.key;
    this.update(key, change);
    if (op === "reply") deliver(key, id, cx);
  }

  /** In the panel: applies the pane's newest request once. @param {string | null} root @param {Deliver} deliver @param {any} cx @returns {boolean} whether one applied */
  takeRequest(root, deliver, cx) {
    const { request, seen } = requestToApply(shared(COMMENT_KEY), this.seen, root, Date.now());
    this.seen = seen;
    if (!request || this.mirror) return false;
    if (request.op === "add") this.add({ root: request.root, path: request.path, anchor: request.anchor, text: request.text }, deliver, cx);
    else this.act(request.op, { root: request.root, path: request.path, id: request.thread, text: request.text }, deliver, cx);
    return true;
  }
}
