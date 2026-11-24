// The coordinator's per-file review guide. Pure: no herdr imports, so node can test it. The file is untrusted.

import { LEVELS } from "./triage.js";

/** @typedef {import("./triage.js").Level} Level */
/** @typedef {{ level: Level, reason: string, sig: string }} GuideFile */
/** @typedef {{ name: string, branch: string, base: string, head: string, at: number | null, summary: string, files: Map<string, GuideFile> }} Guide */
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

/** The guide file's path from a terminal's labels, or null when the review is not the user's. @param {Record<string, string> | undefined} labels @returns {string | null} */
export function guidePath(labels) {
  const path = labels?.guide;
  return labels?.review === "yours" && typeof path === "string" && path.startsWith("/") ? path : null;
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
  return { name: text(g.name, 80), branch: text(g.branch, 120), base: g.base, head: g.head, at, summary: text(g.summary, 600), files };
}

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

/** Counts for the banner. @param {{ entry: GuideEntry, reviewed: boolean }[]} items @returns {{ needYou: number, normal: number, skim: number, done: number }} */
export function guideStats(items) {
  const need = items.filter((i) => i.entry.level === "high");
  return {
    needYou: need.length,
    normal: items.filter((i) => i.entry.level === "normal").length,
    skim: items.filter((i) => i.entry.level === "skim").length,
    done: need.filter((i) => i.reviewed).length,
  };
}
