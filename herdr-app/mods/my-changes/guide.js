// The coordinator's per-file review guide. Pure: no herdr imports, so node can test it. The file is untrusted.

import { LEVELS } from "./triage.js";

/** @typedef {import("./triage.js").Level} Level */
/** @typedef {{ level: Level, reason: string, sig: string }} GuideFile */
/** @typedef {{ name: string, branch: string, baseBranch: string, base: string, head: string, at: number | null, summary: string, files: Map<string, GuideFile> }} Guide */
/** @typedef {{ level: Level, reason: string, stale: boolean }} GuideEntry */

export const CHANGED = "changed since the coordinator's review";
export const NOT_IN_GUIDE = "not in the coordinator's guide";
const MAX_FILES = 2000;
const SHA = /^[0-9a-f]{7,64}$/i;
const SIG = /^[AMDU]:\d+:\d+$/;

/** @param {unknown} v @param {number} max @returns {string} */
const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

/** @param {unknown} p @returns {boolean} */
const safePath = (p) => typeof p === "string" && p.length > 0 && p.length <= 512 && !p.includes("\0") && !p.startsWith("/") && !p.split("/").includes("..");

/** The guide file's path from a terminal's labels, or null when the review is not the user's. A reviewed child keeps its guide so the banner can show it is done. @param {Record<string, string> | undefined} labels @returns {string | null} */
export function guidePath(labels) {
  const path = labels?.guide;
  return (labels?.review === "yours" || labels?.review === "reviewed") && typeof path === "string" && path.startsWith("/") ? path : null;
}

/** A guide with every field checked and bad entries dropped, or null when it cannot be trusted at all. @param {unknown} raw @returns {Guide | null} */
export function validateGuide(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const g = /** @type {Record<string, unknown>} */ (raw);
  if (typeof g.head !== "string" || !SHA.test(g.head) || typeof g.base !== "string" || !SHA.test(g.base)) return null;
  const files = new Map();
  for (const f of Array.isArray(g.files) ? g.files.slice(0, MAX_FILES) : []) {
    if (!f || typeof f !== "object" || !safePath(f.path) || files.has(f.path)) continue;
    if (!LEVELS.includes(f.level) || typeof f.sig !== "string" || !SIG.test(f.sig)) continue;
    files.set(f.path, { level: f.level, reason: text(f.reason, 200), sig: f.sig });
  }
  const at = typeof g.at === "number" && Number.isFinite(g.at) ? g.at : null;
  return { name: text(g.name, 80), branch: text(g.branch, 120), baseBranch: text(g.baseBranch, 120), base: g.base, head: g.head, at, summary: text(g.summary, 600), files };
}

/** Where the branch range starts under a guide: the child's fork point, named by its base branch or a short sha. @param {Guide | null} guide @returns {{ name: string, rev: string } | null} */
export const guideBase = (guide) => (guide ? { name: guide.baseBranch || guide.base.slice(0, 7), rev: guide.base } : null);

/** @param {string} source JSON text @returns {Guide | null} */
export function parseGuide(source) {
  try { return validateGuide(JSON.parse(source)); } catch { return null; }
}

/** Whether the worktree's HEAD is no longer the commit the coordinator reviewed. @param {Guide} guide @param {string} head */
export function headMoved(guide, head) {
  const a = guide.head.toLowerCase(), b = head.toLowerCase();
  return !b || !(a.startsWith(b) || b.startsWith(a));
}

/** What the guide says about one changed file. @param {Guide} guide @param {string} path @param {string} sig the file's current sig @param {boolean} moved @returns {GuideEntry} */
export function guideEntry(guide, path, sig, moved) {
  const g = guide.files.get(path);
  if (moved || (g && g.sig !== sig)) return { level: "high", reason: CHANGED, stale: true };
  if (!g) return { level: "normal", reason: NOT_IN_GUIDE, stale: false };
  return { level: g.level, reason: `Coordinator: ${g.reason || "no reason given"}`, stale: false };
}

/** Counts for the banner, by each file's final level. @param {{ level: Level, reviewed: boolean }[]} items @returns {{ needYou: number, normal: number, skim: number, done: number }} */
export function guideStats(items) {
  const need = items.filter((i) => i.level === "high");
  return {
    needYou: need.length,
    normal: items.filter((i) => i.level === "normal").length,
    skim: items.filter((i) => i.level === "skim").length,
    done: need.filter((i) => i.reviewed).length,
  };
}

/** Whether the user may tell the coordinator the review is done: every Look closely file is ticked. @param {{ needYou: number, done: number }} stats @returns {boolean} */
export const canFinish = (stats) => stats.done === stats.needYou;

/** Whether a Done reviewing click should proceed: not while one is in flight, and not for a child already marked reviewed. @param {Record<string, string> | undefined} labels @param {boolean} busy @returns {boolean} */
export const shouldFinish = (labels, busy) => !busy && labels?.review !== "reviewed";

const TERMINAL_ADDRESS = /^t[0-9a-z]{1,8}$/;

/** Who to tell, and what, when the user finishes reviewing; null without a usable coord and task label. @param {Record<string, string> | undefined} labels @returns {{ coord: string, text: string } | null} */
export function notifyTarget(labels) {
  const coord = labels?.coord, task = text(labels?.task, 80);
  if (typeof coord !== "string" || !TERMINAL_ADDRESS.test(coord) || !task) return null;
  return { coord, task, text: `[Changes tab] The user finished reviewing ${task} (clicked Done reviewing). Ask them before merging or closing it.` };
}

/** @typedef {{ jump: boolean, note: string, toast: { title: string, level: "success" | "warning" } | null }} FinishOutcome */

/** What the user sees after a Done reviewing click. With a coordinator to tell (`task` set), they go back to it and get a toast; without one they stay and see a note. @param {boolean} labelOk @param {boolean} sentOk @param {string | null} task the sanitized task, null without a usable coord @param {boolean} [held] the message waits for a blocked coordinator @returns {FinishOutcome} */
export function finishOutcome(labelOk, sentOk, task, held = false) {
  if (!labelOk) return { jump: false, note: "Could not mark it reviewed", toast: null };
  if (!task) return { jump: false, note: "Marked reviewed; could not tell the coordinator", toast: null };
  if (held) return { jump: true, note: "", toast: { title: `Marked ${task} reviewed. Will tell its coordinator when it is free.`, level: "success" } };
  const toast = sentOk
    ? { title: `Marked ${task} reviewed. Told its coordinator.`, level: "success" }
    : { title: `Marked ${task} reviewed. Could not tell its coordinator.`, level: "warning" };
  return { jump: true, note: "", toast };
}

export const RETRY_MS = 2000;
export const HOLD_MS = 10 * 60 * 1000;

/** Whether to send the finish message now. Text typed into a blocked coordinator lands in its open dialog and is lost, so wait until it is free, for at most HOLD_MS. @param {string | null | undefined} status the coordinator terminal's status @param {number} waitedMs @returns {"send" | "wait" | "give-up"} */
export function deliveryAction(status, waitedMs) {
  if (status !== "blocked") return "send";
  return waitedMs >= HOLD_MS ? "give-up" : "wait";
}

/** The warning when a held message could not be delivered. @param {string} task */
export const undeliveredToast = (task) => ({ title: `Could not tell the coordinator that ${task} was reviewed. Tell it yourself.`, level: /** @type {const} */ ("warning") });
