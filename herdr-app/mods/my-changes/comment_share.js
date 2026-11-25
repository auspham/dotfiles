// How the review pane sees the side panel's comment threads and asks it to change them. The side panel owns the threads; the pane only draws them and sends requests. Pure: no herdr imports, so node can test it.

import { parseThreads } from "./comment_threads.js";
import { parseAnchor } from "./comment_anchor.js";
import { TOGGLE_TTL_MS } from "./review_pane.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {import("./comment_anchor.js").Anchor} Anchor */
/** drafts: unsent comments in every file, for the pane's Send button. */
/** @typedef {{ root: string, path: string, threads: Thread[], drafts: number }} SharedThreads */
/** @typedef {{ op: "add", root: string, path: string, anchor: Anchor, text: string, ts: number } | { op: "send", root: string, path: string, text: string, ts: number } | { op: "reply" | "edit" | "discard" | "resolve" | "reopen" | "delete", root: string, path: string, thread: string, text: string, ts: number }} CommentRequest */

export const COMMENT_KEY = "review.comment";
export const OPS = ["add", "send", "reply", "edit", "discard", "resolve", "reopen", "delete"];

/** The shared key that carries one tab's threads for its open file. @param {string} tab */
export const threadsKey = (tab) => `review.threads.${tab}`;

/** Threads and the draft count the pane received, or null unless they are for the folder and file it shows. @param {unknown} v @param {string} root @param {string} path @returns {{ threads: Thread[], drafts: number } | null} */
export function parseShared(v, root, path) {
  const s = /** @type {any} */ (v);
  if (!s || typeof s !== "object" || s.root !== root || s.path !== path) return null;
  const drafts = Number.isInteger(s.drafts) && s.drafts >= 0 ? s.drafts : 0;
  return { threads: parseThreads(s.threads).filter((t) => t.path === path), drafts };
}

const isText = (v) => typeof v === "string" && v.length > 0;

/** A request read back from shared state, or null unless it is well formed. @param {unknown} v @returns {CommentRequest | null} */
export function parseRequest(v) {
  const r = /** @type {any} */ (v);
  if (!r || typeof r !== "object" || !OPS.includes(r.op) || !isText(r.root) || !isText(r.path) || !Number.isFinite(r.ts) || typeof r.text !== "string") return null;
  if (r.op === "add") {
    const anchor = parseAnchor(r.anchor);
    return anchor && r.text.trim() ? { op: "add", root: r.root, path: r.path, anchor, text: r.text, ts: r.ts } : null;
  }
  if (r.op === "send") return { op: "send", root: r.root, path: r.path, text: "", ts: r.ts };
  return isText(r.thread) ? { op: r.op, root: r.root, path: r.path, thread: r.thread, text: r.text, ts: r.ts } : null;
}

/** The pane's newest request to apply in the side panel (or null), and the request to remember as handled, so each applies once. @param {unknown} raw @param {number | null} seen @param {string | null} root @param {number} now @returns {{ request: CommentRequest | null, seen: number | null }} */
export function requestToApply(raw, seen, root, now) {
  const r = parseRequest(raw);
  if (!r || r.ts === seen) return { request: null, seen };
  const fresh = now - r.ts <= TOGGLE_TTL_MS && r.root === root;
  return { request: fresh ? r : null, seen: r.ts };
}
