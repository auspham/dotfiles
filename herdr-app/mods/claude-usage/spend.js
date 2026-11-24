// Pure helpers for the Claude usage panel: which view to show and the spend totals.

/**
 * @typedef {{ cost: number, at: number }} CostEntry  at is epoch milliseconds.
 * @typedef {{ today: number, week: number, month: number }} SpendTotals
 */

/**
 * @param {string} text contents of one ~/.cache/claude/cost/<session>.json
 * @returns {CostEntry | null} null when the file is damaged or its cost is not a number
 */
export function parseCost(text) {
  try {
    const o = JSON.parse(text);
    const cost = typeof o?.cost === "number" ? o.cost : NaN;
    const at = Number(o?.at) * 1000;
    return Number.isFinite(cost) && Number.isFinite(at) ? { cost, at } : null;
  } catch {
    return null;
  }
}

/**
 * Each session counts once, on the day it last reported. The last 7 days are today and the six before it.
 * @param {CostEntry[]} entries
 * @param {number} now epoch milliseconds
 * @returns {SpendTotals}
 */
export function spendTotals(entries, now) {
  const d = new Date(now);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const week = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6).getTime();
  const month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const sum = (/** @type {number} */ from) =>
    entries.reduce((total, e) => (e.at >= from && e.at <= now ? total + e.cost : total), 0);
  return { today: sum(today), week: sum(week), month: sum(month) };
}

/**
 * @param {{ rate_limits?: object | null } | null} data parsed usage.json
 * @returns {"limits" | "spend"}
 */
export function pickView(data) {
  return data?.rate_limits && typeof data.rate_limits === "object" ? "limits" : "spend";
}

/** @param {number} n */
export const dollars = (n) => `$${n.toFixed(2)}`;
