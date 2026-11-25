// Who answers a comment, and the text it is sent. Pure: no herdr imports, so node can test it.

import { anchorLabel, anchorText } from "./comment_anchor.js";

/** @typedef {import("./comment_threads.js").Thread} Thread */
/** @typedef {{ address: string, state?: string, status?: string | null, name?: string | null, title?: string, cwd?: string, foreground?: { cwd?: string }, labels?: Record<string, string> }} Term */
/** @typedef {{ kind: "agent", address: string, name: string } | { kind: "claude", session: string | null }} Target */

const FENCE = "`".repeat(3);

const inside = (cwd, root) => Boolean(cwd) && Boolean(root) && (cwd === root || cwd.startsWith(`${root}/`));

/** Where a comment goes: the live agent the panel follows when it works in this folder, since it wrote the code; else claude -p, which forks the agent's own session when its terminal still names one, so the answer has its context. @param {Term | null | undefined} term @param {string} root @returns {Target} */
export function pickTarget(term, root) {
  if (term && term.state === "live" && term.status && inside(term.foreground?.cwd ?? term.cwd, root)) {
    return { kind: "agent", address: term.address, name: term.name || term.title || term.address };
  }
  const session = term?.labels?.["claude.session"];
  return { kind: "claude", session: typeof session === "string" && session ? session : null };
}

/** The thread so far, oldest first, for a follow-up's context. @param {Thread} t */
function history(t) {
  return t.exchanges.slice(0, -1).map((e) => `Comment: ${e.q}\nAnswer: ${e.a || "(none)"}`).join("\n\n");
}

/** The comment on its lines, with the earlier exchanges when it is a follow-up. @param {Thread} t */
function body(t) {
  const q = t.exchanges[t.exchanges.length - 1].q, earlier = history(t);
  return `On ${t.path}, ${anchorLabel(t.anchor)}:\n${FENCE}diff\n${anchorText(t.anchor)}\n${FENCE}\n${earlier ? `Earlier in this thread:\n${earlier}\n\nFollow-up: ` : ""}${q}`;
}

/** One thread's part of the batch file: the lines, the earlier exchanges and the newest comment. @param {Thread} t */
export const commentNote = (t) => `Review comment ${t.id}. ${body(t)}`;

/** The prompt for claude -p when no agent owns the view. @param {Thread} t */
export const claudePrompt = (t) => `A review comment. ${body(t)}`;
