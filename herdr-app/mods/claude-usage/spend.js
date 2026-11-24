// Pure helpers for the Claude usage panel: which view to show and the spend totals.

/**
 * @typedef {{ cost: number, at: number, limits: boolean }} CostEntry  at is epoch milliseconds; limits is true for a
 * session that reported rate limits (a personal account), which spend does not count. Old files have no such field.
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
    return Number.isFinite(cost) && Number.isFinite(at) ? { cost, at, limits: o.limits === true } : null;
  } catch {
    return null;
  }
}

const LIMITS_FRESH_MS = 6 * 3600000;

/** @param {CostEntry[]} entries */
const work = (entries) => entries.filter((e) => !e.limits);

/**
 * Each work session counts once, on the day it last reported. The last 7 days are today and the six before it.
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
    work(entries).reduce((total, e) => (e.at >= from && e.at <= now ? total + e.cost : total), 0);
  return { today: sum(today), week: sum(week), month: sum(month) };
}

/**
 * @param {{ rate_limits?: object | null, at?: number } | null} data parsed limits.json
 * @param {CostEntry[]} entries
 * @param {number} now epoch milliseconds
 * @returns {{ limits: boolean, spend: boolean }} which sections to show; both can be on at once
 */
export function pickViews(data, entries, now) {
  const at = Number(data?.at) * 1000;
  const limits = !!data?.rate_limits && typeof data.rate_limits === "object" && now - at <= LIMITS_FRESH_MS;
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return { limits, spend: work(entries).some((e) => e.at >= monthStart && e.at <= now) };
}

/** @param {number} n */
export const dollars = (n) => `$${n.toFixed(2)}`;
