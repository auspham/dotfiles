// Answers agents send back with `hreview reply <id> <text>`, one JSON line each, and how they join their threads. Pure: no herdr imports, so node can test it.

import { lastOf } from "./comment_threads.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {{ id: string, text: string, from: string }} Reply */

/** The file hreview appends to, under the state folder. @param {string} stateHome */
export const repliesPath = (stateHome) => `${stateHome}/herdr-review/replies.jsonl`;

/** Each well-formed line of the replies file; anything else (a partial write, a foreign line) is skipped. @param {string} text @returns {Reply[]} */
export function parseReplies(text) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let v = null;
    try { v = JSON.parse(line); } catch { continue; }
    if (v && typeof v.id === "string" && typeof v.text === "string" && v.text.trim() && typeof v.from === "string" && v.from) out.push({ id: v.id, text: v.text.trim(), from: v.from });
  }
  return out;
}

/** Joins new replies to the threads they answer, after the thread's `heard` count. Only the agent the newest comment was sent to is heard: a reply from another terminal is passed over. @param {Thread[]} threads @param {Reply[]} replies @returns {{ threads: Thread[], changed: boolean }} */
export function applyReplies(threads, replies) {
  let changed = false;
  const next = threads.map((t) => {
    const all = replies.filter((r) => r.id === t.id);
    if (all.length <= t.heard) return t;
    changed = true;
    const last = lastOf(t), fresh = all.slice(t.heard).filter((r) => r.from === last.to?.address).map((r) => r.text);
    if (!fresh.length) return { ...t, heard: all.length };
    const a = [last.status === "done" ? last.a : "", ...fresh].filter(Boolean).join("\n\n");
    return { ...t, heard: all.length, exchanges: [...t.exchanges.slice(0, -1), { ...last, a, status: "done" }] };
  });
  return { threads: next, changed };
}
